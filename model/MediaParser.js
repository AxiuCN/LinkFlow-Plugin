import path from 'node:path'
import fs from 'node:fs'
import fetch from 'node-fetch'
import { runSpawn, exists, ensureDir } from '../components/utils.js'
import { ytDlpPath, YTDLP_DEFAULT_TIMEOUT_MS, YTDLP_DEFAULT_MAX_SIZE_MB, downloadCacheDir, botAccountsDir, toolDir } from '../components/constants.js'

/** yt-dlp GitHub Release API */
const YTDLP_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
const YTDLP_DOWNLOAD_URL_WIN = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const YTDLP_VERSION_FILE = path.join(path.dirname(ytDlpPath), '.version')

/**
 * 确保 yt-dlp 已安装并最新
 * 1. 不存在则从 GitHub 下载
 * 2. 存在但超过 YTDLP_UPDATE_INTERVAL_DAYS 天则更新
 * @returns {Promise<string>} yt-dlp 可执行文件路径
 */
async function ensureYtDlp() {
  const ytDir = path.dirname(ytDlpPath)
  ensureDir(ytDir)

  const needDownload = !fs.existsSync(ytDlpPath)
  if (!needDownload) {
    // 检查版本文件的年龄
    if (fs.existsSync(YTDLP_VERSION_FILE)) {
      try {
        const saved = new Date(fs.readFileSync(YTDLP_VERSION_FILE, 'utf8').trim()).getTime()
        const ageDays = (Date.now() - saved) / (86400 * 1000)
        if (ageDays < 30) return ytDlpPath  // 还不过期
      } catch { /* 读取失败则重新下载 */ }
    }
  }

  // 需要下载/更新
  await downloadYtDlp(ytDir)
  return ytDlpPath
}

/**
 * 从 GitHub Releases 下载 yt-dlp
 * @param {string} ytDir
 */
async function downloadYtDlp(ytDir) {
  try {
    // 查询最新版本
    const apiRes = await fetch(YTDLP_RELEASE_API, {
      headers: { 'User-Agent': 'LinkFlow-Plugin/2.0', Accept: 'application/json' },
    })
    const release = await apiRes.json()
    const tagName = release?.tag_name || 'latest'

    const downloadUrl = process.platform === 'win32' ? YTDLP_DOWNLOAD_URL_WIN
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

    logger?.info(`[LinkFlow] 正在下载 yt-dlp ${tagName} ...`)
    const res = await fetch(downloadUrl)
    if (!res.ok) throw new Error(`yt-dlp 下载失败: HTTP ${res.status}`)

    const buf = Buffer.from(await res.arrayBuffer())
    const tmp = ytDlpPath + '.tmp'
    fs.writeFileSync(tmp, buf)

    // 替换旧版本
    if (fs.existsSync(ytDlpPath)) fs.unlinkSync(ytDlpPath)
    fs.renameSync(tmp, ytDlpPath)

    // Windows: 不需要 chmod
    if (process.platform !== 'win32') {
      fs.chmodSync(ytDlpPath, 0o755)
    }

    // 写入版本文件
    fs.writeFileSync(YTDLP_VERSION_FILE, new Date().toISOString(), 'utf8')
    logger?.info(`[LinkFlow] yt-dlp ${tagName} 下载完成`)
  } catch (e) {
    logger?.error('[LinkFlow] yt-dlp 下载失败:', e)
    // 已有旧版则继续用
    if (fs.existsSync(ytDlpPath)) {
      logger?.info('[LinkFlow] 回退使用已有 yt-dlp')
      return
    }
    throw e
  }
}

/**
 * 使用 yt-dlp 提取媒体元数据（不下载）
 * @param {string} url - 视频 URL
 * @param {object} [opts]
 * @param {number} [opts.timeout] - 超时毫秒
 * @returns {Promise<object|null>} 解析后的元数据
 */
async function extractMetadata(url, opts = {}) {
  try {
    const ytDlpBin = await ensureYtDlp()
    const { stdout } = await runSpawn(ytDlpBin, [
      '-j',          // JSON 输出
      '--no-playlist',
      '--flat-playlist',
      '--socket-timeout', '15',
      url,
    ], { timeout: opts.timeout || 30000 })

    const info = JSON.parse(stdout)
    return normalizeMetadata(info)
  } catch (e) {
    logger?.error('[LinkFlow] extractMetadata 失败:', e.message)
    return null
  }
}

/**
 * 使用 yt-dlp 下载视频
 * @param {string} url - 视频 URL
 * @param {object} [opts]
 * @param {string} [opts.format] - 格式选择器，默认 'bv*[height<=1080]+ba/b'
 * @param {number} [opts.timeout] - 超时毫秒
 * @param {number} [opts.maxSizeMb] - 最大文件大小 MB
 * @param {string} [opts.cookiesFile] - B站 cookie 文件路径（Netscape 格式）
 * @returns {Promise<{filePath: string, metadata: object}|null>}
 */
async function downloadMedia(url, opts = {}) {
  const timeout = opts.timeout || YTDLP_DEFAULT_TIMEOUT_MS
  const maxSizeMb = opts.maxSizeMb || YTDLP_DEFAULT_MAX_SIZE_MB
  const format = opts.format || 'bv*[height<=1080]+ba/b'

  ensureDir(downloadCacheDir)

  const outputTemplate = path.join(downloadCacheDir, '%(title).100s [%(id)s].%(ext)s')

  try {
    const ytDlpBin = await ensureYtDlp()
    const args = [
      '-f', format,
      '-P', downloadCacheDir,
      '-o', outputTemplate,
      '--no-playlist',
      '--no-mtime',
      '--socket-timeout', '15',
      '--max-filesize', `${maxSizeMb}M`,
      '--print', 'after_move:filepath',
      '--print', 'after_move:title',
      '--print', 'after_move:uploader',
    ]

    // B站 cookie
    if (opts.cookiesFile && fs.existsSync(opts.cookiesFile)) {
      args.push('--cookies', opts.cookiesFile)
    }

    args.push(url)

    const { stdout, stderr } = await runSpawn(ytDlpBin, args, { timeout })

    // stdout 行：filepath\ntitle\nuploader\n
    const lines = stdout.trim().split('\n')
    const filePath = lines[0]?.trim() || ''
    const title = lines[1]?.trim() || ''
    const uploader = lines[2]?.trim() || ''

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`下载失败: 未找到输出文件\n${stderr}`)
    }

    // 检查文件大小
    const stat = fs.statSync(filePath)
    const sizeMb = stat.size / (1024 * 1024)
    if (sizeMb > maxSizeMb) {
      fs.unlinkSync(filePath)
      throw new Error(`文件过大: ${sizeMb.toFixed(1)}MB > ${maxSizeMb}MB`)
    }

    return {
      filePath,
      metadata: { title, uploader, sizeMb: sizeMb.toFixed(1) },
    }
  } catch (e) {
    logger?.error('[LinkFlow] downloadMedia 失败:', e.message)
    return null
  }
}

/**
 * 将 B站 Cookie 转为 Netscape 格式临时文件（供 yt-dlp --cookies 使用）
 * @returns {Promise<string|null>} cookie 文件路径，无 bot cookie 则返回 null
 */
async function createBiliCookieFile() {
  const cookieFile = path.join(downloadCacheDir, '.bili_cookies.txt')
  const ckPath = path.join(botAccountsDir, 'bilibili.json')
  if (!fs.existsSync(ckPath)) return null

  try {
    const payload = JSON.parse(fs.readFileSync(ckPath, 'utf8'))
    const cookies = payload?.cookies
    if (!cookies) return null

    const lines = ['# Netscape HTTP Cookie File']
    for (const [name, value] of Object.entries(cookies)) {
      lines.push(`.bilibili.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}`)
    }
    ensureDir(downloadCacheDir)
    fs.writeFileSync(cookieFile, lines.join('\n'), 'utf8')
    return cookieFile
  } catch {
    return null
  }
}

/**
 * 将 yt-dlp -j 原始信息归一化为标准结构
 * @param {object} raw
 * @returns {object}
 */
function normalizeMetadata(raw) {
  return {
    id: raw.id || raw.display_id || '',
    title: raw.title || '',
    fulltitle: raw.fulltitle || raw.title || '',
    description: raw.description || '',
    uploader: raw.uploader || '',
    uploaderId: raw.uploader_id || '',
    uploaderUrl: raw.uploader_url || '',
    duration: raw.duration || 0,
    durationString: raw.duration_string || raw.duration || '',
    viewCount: raw.view_count || 0,
    likeCount: raw.like_count || 0,
    thumbnail: raw.thumbnail || '',
    webpageUrl: raw.webpage_url || raw.original_url || '',
    extractor: raw.extractor || '',
    extractorKey: raw.extractor_key || '',
    timestamp: raw.timestamp || 0,
    uploadDate: raw.upload_date || '',
    width: raw.width || 0,
    height: raw.height || 0,
    formats: (raw.formats || []).map(f => ({
      formatId: f.format_id || '',
      ext: f.ext || '',
      width: f.width || 0,
      height: f.height || 0,
      filesize: f.filesize || 0,
      formatNote: f.format_note || '',
      vcodec: f.vcodec || '',
      acodec: f.acodec || '',
    })),
  }
}

export { ensureYtDlp, extractMetadata, downloadMedia, createBiliCookieFile, normalizeMetadata }
