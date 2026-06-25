import path from 'node:path'
import fs from 'node:fs'
import { runSpawn, exists, ensureDir } from '../components/utils.js'
import { bbdownPath, aria2cPath, downloadCacheDir, botAccountsDir } from '../components/constants.js'
import { loadBotCookies, formatCookiesText } from './bilibili/auth.js'

/**
 * BBDown — B站视频下载封装
 *
 * 参考 Lotus-ReFactor services/bilibili/service.js 的 BBDown 调用逻辑
 * BBDown 是 B站视频的独立下载方案，不依赖 media_parser / yt-dlp
 */

/** BBDown 支持的媒体文件扩展名 */
const MEDIA_EXTENSIONS = new Set(['.mp4', '.mkv', '.flv', '.mov', '.m4v', '.mp3', '.flac', '.wav'])

/**
 * 获取 BBDown 可执行路径
 * @returns {string|null}
 */
function getBBDownPath() {
  return fs.existsSync(bbdownPath) ? bbdownPath : null
}

/**
 * 获取用于 BBDown -c 参数的 SESSDATA
 * 优先级: bot Cookie → BBDown.data 文件
 * @returns {string|null}
 */
function getSessData() {
  // 1. 从 bot Cookie 获取
  const botCookies = loadBotCookies()
  if (botCookies?.SESSDATA) return botCookies.SESSDATA

  // 2. 从 BBDown.data 文件读取
  const dataFile = path.join(path.dirname(bbdownPath), 'BBDown.data')
  if (fs.existsSync(dataFile)) {
    try {
      const content = fs.readFileSync(dataFile, 'utf8')
      const match = content.match(/SESSDATA=([^\s;]+)/)
      if (match?.[1]) return match[1]
    } catch {}
  }

  return null
}

/**
 * 使用 BBDown 下载 B站视频
 * @param {string} url - B站视频 URL
 * @param {object} [opts]
 * @param {number} [opts.timeout] - 超时毫秒
 * @param {number} [opts.maxSizeMb] - 最大文件大小 MB
 * @param {boolean} [opts.useAria2] - 是否使用 aria2 加速
 * @param {string} [opts.resolution] - 画质优先级（BBDown --dfn-priority）
 * @param {number} [opts.page] - 分P页码（从1开始）
 * @returns {Promise<{filePaths: string[], metadata: object}|null>}
 */
async function download(url, opts = {}) {
  const bbdown = getBBDownPath()
  if (!bbdown) return null

  const timeout = opts.timeout || 600000
  const maxSizeMb = opts.maxSizeMb || 100
  const workDir = path.join(downloadCacheDir, 'tmp')
  ensureDir(workDir)

  // 构造参数
  const args = [url, '--work-dir', workDir]

  // aria2 加速
  if (opts.useAria2 && fs.existsSync(aria2cPath)) {
    args.push('--use-aria2c')
  }

  // 分P
  if (opts.page) {
    args.push('-p', String(opts.page))
  }

  // 画质优先级
  if (opts.resolution) {
    args.push('--dfn-priority', String(opts.resolution))
  }

  // SESSDATA
  const sessdata = getSessData()
  if (sessdata) {
    args.push('-c', `SESSDATA=${sessdata}`)
  }

  logger?.info(`[LinkFlow] BBDown 下载: ${url}`)

  try {
    await runSpawn(bbdown, args, {
      timeout,
      cwd: path.dirname(bbdown),
    })

    // 扫描输出文件
    const filePaths = findMediaFiles(workDir)
    if (!filePaths.length) {
      logger?.warn('[LinkFlow] BBDown 完成但未找到输出文件')
      return null
    }

    // 移动到 downloadCacheDir
    const finalPaths = []
    for (const fp of filePaths) {
      const fileName = path.basename(fp)
      const destPath = path.join(downloadCacheDir, fileName)

      // 检查文件大小
      const stat = fs.statSync(fp)
      const sizeMb = stat.size / (1024 * 1024)
      if (sizeMb > maxSizeMb) {
        logger?.warn(`[LinkFlow] BBDown 输出文件过大 ${sizeMb.toFixed(1)}MB > ${maxSizeMb}MB，跳过: ${fileName}`)
        try { fs.unlinkSync(fp) } catch {}
        continue
      }

      // 移动文件
      if (fp !== destPath) {
        // 目标已存在时加序号
        let target = destPath
        let counter = 1
        while (fs.existsSync(target)) {
          const ext = path.extname(destPath)
          const base = path.basename(destPath, ext)
          target = path.join(downloadCacheDir, `${base}_${counter}${ext}`)
          counter++
        }
        fs.renameSync(fp, target)
        finalPaths.push(target)
      } else {
        finalPaths.push(fp)
      }
    }

    // 清理临时目录
    try {
      const remaining = fs.readdirSync(workDir)
      if (!remaining.length) {
        fs.rmdirSync(workDir)
      }
    } catch {}

    if (!finalPaths.length) return null

    return {
      filePaths: finalPaths,
      metadata: {
        title: path.basename(finalPaths[0], path.extname(finalPaths[0])),
        sizeMb: finalPaths.reduce((sum, fp) => {
          try { return sum + fs.statSync(fp).size / (1024 * 1024) } catch { return sum }
        }, 0).toFixed(1),
      },
    }
  } catch (e) {
    logger?.error(`[LinkFlow] BBDown 下载失败: ${e.message}`)
    return null
  }
}

/**
 * BBDown 登录（QR 扫码）
 * 监控 qrcode.png 文件出现后渲染给用户
 * @param {object} e - Yunzai 消息事件
 * @param {object} [opts]
 * @param {Function} [opts.onQR] - 二维码图片路径回调
 * @param {number} [opts.timeout] - 超时毫秒
 * @returns {Promise<boolean>} 是否登录成功
 */
async function login(e, opts = {}) {
  const bbdown = getBBDownPath()
  if (!bbdown) {
    e.reply('[LinkFlow] BBDown 未安装，请先发送 #初始化工具环境')
    return false
  }

  const bbdownDir = path.dirname(bbdown)
  const qrPath = path.join(bbdownDir, 'qrcode.png')
  const timeout = opts.timeout || 180000

  // 清理旧二维码
  if (fs.existsSync(qrPath)) {
    try { fs.unlinkSync(qrPath) } catch {}
  }

  logger?.info('[LinkFlow] 启动 BBDown 登录 ...')

  // 异步 spawn BBDown login
  const proc = new Promise((resolve, reject) => {
    const child = spawn(bbdown, ['login'], {
      cwd: bbdownDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', d => { stdout += d.toString() })
    child.stderr?.on('data', d => { stderr += d.toString() })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('登录超时'))
    }, timeout)

    child.on('close', (code) => {
      clearTimeout(timer)
      const output = stdout + stderr
      if (code === 0 || /登录成功|login success/i.test(output)) {
        resolve(true)
      } else {
        reject(new Error(`BBDown login 退出: code=${code}`))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })

  // 轮询 qrcode.png
  const qrDeadline = Date.now() + timeout
  let qrSent = false

  while (Date.now() < qrDeadline) {
    if (!qrSent && fs.existsSync(qrPath)) {
      qrSent = true
      if (opts.onQR) {
        await opts.onQR(qrPath)
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  try {
    const success = await proc
    if (success) {
      logger?.info('[LinkFlow] BBDown 登录成功')

      // 从 BBDown.data 提取 Cookie 保存到 bot 账号
      await _syncBBDownCookiesToBot()
      return true
    }
  } catch (e) {
    logger?.error(`[LinkFlow] BBDown 登录失败: ${e.message}`)
  }

  return false
}

/**
 * 从 BBDown.data 提取 Cookie 同步到 bot 账号
 * 保留 bot 账号功能，便于未来扩展
 */
async function _syncBBDownCookiesToBot() {
  const dataFile = path.join(path.dirname(bbdownPath), 'BBDown.data')
  if (!fs.existsSync(dataFile)) return

  try {
    const content = fs.readFileSync(dataFile, 'utf8')
    const cookies = {}

    // BBDown.data 中 Cookie 以 key=value 格式存储，每行一个
    const cookiePattern = /(\w+)=([^\s;]+)/g
    let match
    while ((match = cookiePattern.exec(content)) !== null) {
      cookies[match[1]] = match[2]
    }

    if (cookies.SESSDATA && cookies.bili_jct) {
      // 导入 saveBotCookies（避免循环依赖，延迟加载）
      const { saveBotCookies } = await import('./bilibili/auth.js')
      saveBotCookies(cookies)
      logger?.info('[LinkFlow] BBDown Cookie 已同步到机器人账号')
    }
  } catch (e) {
    logger?.warn(`[LinkFlow] 同步 BBDown Cookie 失败: ${e.message}`)
  }
}

/**
 * 在目录中递归查找媒体文件
 * @param {string} dir
 * @returns {string[]}
 */
function findMediaFiles(dir) {
  const results = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (MEDIA_EXTENSIONS.has(ext)) {
          results.push(fullPath)
        }
      } else if (entry.isDirectory()) {
        results.push(...findMediaFiles(fullPath))
      }
    }
  } catch {}
  return results
}

export { download, login, getBBDownPath, getSessData, findMediaFiles }
