import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { execSync, spawn } from 'node:child_process'
import {
  toolDir,
  bbdownPath,
  ffmpegPath,
  aria2cPath,
  mediaParserDir,
  mediaParserVenvDir,
  TOOL_REPOS,
  TOOL_ASSET_PATTERNS,
  TOOL_GITHUB_API_BASES,
  TOOL_API_TIMEOUT_MS,
  TOOL_DOWNLOAD_TIMEOUT_MS,
  TOOL_EXTRACT_TIMEOUT_MS,
  TOOL_DOWNLOAD_MIRRORS,
  TOOL_FFMPEG_MIRROR_URL,
} from './constants.js'
import { runSpawn, exists, ensureDir } from './utils.js'

/**
 * ToolManager — 统一管理外部工具（bbdown / ffmpeg / aria2 / media_parser）
 *
 * 二进制工具（bbdown/ffmpeg/aria2）通过 GitHub Releases API 下载，.version 文件追踪版本
 * media_parser 通过 Python venv + pip 安装依赖，.fingerprint 文件追踪变更
 *
 * 更新策略：
 *   autoInstall + checkUpdate → 对比 GitHub 最新 tag，有新版则自动下载
 *   autoInstall only           → 仅首次安装，已有则跳过
 *   autoInstall = false        → 全部跳过
 */
class ToolManager {
  constructor() {
    this._installed = new Map()
  }

  /**
   * 检查并安装/更新所有已启用的工具
   * @param {object} [toolCfg] - tool 配置段
   * @param {object} [opts]
   * @param {boolean} [opts.checkUpdate] - 是否检查更新（默认 false，仅首次安装）
   */
  async ensureAll(toolCfg = {}, opts = {}) {
    const autoInstall = toolCfg.autoInstall !== false
    const checkUpdate = opts.checkUpdate === true

    if (toolCfg.bbdown?.enabled !== false) {
      await this._ensureBinary('bbdown', autoInstall, checkUpdate)
    }
    if (toolCfg.ffmpeg?.enabled !== false) {
      await this._ensureBinary('ffmpeg', autoInstall, checkUpdate)
    }
    if (toolCfg.aria2?.enabled !== false) {
      await this._ensureBinary('aria2', autoInstall, checkUpdate)
    }
    if (toolCfg.mediaParser?.enabled !== false) {
      await this._ensureMediaParser(autoInstall, checkUpdate)
    }
  }

  /**
   * 检查指定工具是否已安装
   * @param {string} name - bbdown / ffmpeg / aria2 / mediaParser
   * @returns {boolean}
   */
  isInstalled(name) {
    return this._installed.get(name) === true
  }

  /**
   * 获取工具可执行路径
   * @param {string} name
   * @returns {string|null}
   */
  getToolPath(name) {
    const map = { bbdown: bbdownPath, ffmpeg: ffmpegPath, aria2: aria2cPath }
    const p = map[name]
    if (p && fs.existsSync(p)) return p
    return null
  }

  // ==================== 二进制工具 ====================

  /**
   * 确保二进制工具已安装
   * @param {string} name - bbdown / ffmpeg / aria2
   * @param {boolean} autoInstall
   * @param {boolean} checkUpdate - 是否检查 GitHub 更新
   */
  async _ensureBinary(name, autoInstall, checkUpdate) {
    const binPath = this.getToolPath(name)

    if (!binPath) {
      // 不存在 → 安装
      if (!autoInstall) {
        logger?.info(`[LinkFlow] ${name} 未安装且 autoInstall 关闭，跳过`)
        return
      }
      return await this._installBinary(name)
    }

    // 已安装 → 标记
    this._installed.set(name, true)

    if (!checkUpdate) return

    // 检查更新
    const updateInfo = await this._checkBinaryUpdate(name)
    if (!updateInfo.needsUpdate) {
      logger?.info(`[LinkFlow] ${name} 已是最新: ${updateInfo.currentTag}`)
      return
    }

    logger?.info(`[LinkFlow] ${name} 有更新: ${updateInfo.currentTag} → ${updateInfo.latestTag}`)
    try {
      await this._installBinary(name)
    } catch (e) {
      logger?.error(`[LinkFlow] ${name} 更新失败:`, e.message)
      // ffmpeg 尝试镜像兜底
      if (name === 'ffmpeg') {
        try {
          await this._downloadFfmpegMirror()
          this._installed.set(name, true)
          logger?.info(`[LinkFlow] ffmpeg 镜像下载完成`)
        } catch (e2) {
          logger?.error(`[LinkFlow] ffmpeg 镜像下载也失败:`, e2.message)
        }
      }
    }
  }

  /**
   * 安装单个二进制工具（内部调用 _downloadFromGitHub）
   * @param {string} name
   */
  async _installBinary(name) {
    logger?.info(`[LinkFlow] 正在安装 ${name} ...`)
    try {
      const tag = await this._downloadFromGitHub(name)
      this._writeVersionFile(name, tag)
      this._installed.set(name, true)
      logger?.info(`[LinkFlow] ${name} 安装完成 (${tag})`)
    } catch (e) {
      logger?.error(`[LinkFlow] ${name} 安装失败:`, e.message)
      if (name === 'ffmpeg') {
        try {
          await this._downloadFfmpegMirror()
          this._writeVersionFile(name, 'mirror')
          this._installed.set(name, true)
          logger?.info(`[LinkFlow] ffmpeg 镜像下载完成`)
        } catch (e2) {
          logger?.error(`[LinkFlow] ffmpeg 镜像下载也失败:`, e2.message)
        }
      } else {
        throw e
      }
    }
  }

  /**
   * 检查二进制工具是否需要更新
   * @param {string} name
   * @returns {Promise<{needsUpdate: boolean, currentTag: string, latestTag: string}>}
   */
  async _checkBinaryUpdate(name) {
    const repoInfo = TOOL_REPOS[name]
    if (!repoInfo) return { needsUpdate: false, currentTag: 'unknown', latestTag: 'unknown' }

    const currentTag = this._readVersionFile(name) || 'none'
    const release = await this._fetchGitHubRelease(repoInfo.repo)
    const latestTag = release?.tag_name || 'unknown'

    return {
      needsUpdate: currentTag !== latestTag && latestTag !== 'unknown',
      currentTag,
      latestTag,
    }
  }

  /**
   * 读取 .version 文件中的 tag
   * @param {string} name
   * @returns {string|null}
   */
  _readVersionFile(name) {
    const targetMap = { bbdown: bbdownPath, ffmpeg: ffmpegPath, aria2: aria2cPath }
    const binPath = targetMap[name]
    if (!binPath) return null
    const versionFile = path.join(path.dirname(binPath), '.version')
    try {
      if (fs.existsSync(versionFile)) {
        return fs.readFileSync(versionFile, 'utf8').trim()
      }
    } catch {}
    return null
  }

  /**
   * 写入 .version 文件
   * @param {string} name
   * @param {string} tag
   */
  _writeVersionFile(name, tag) {
    const targetMap = { bbdown: bbdownPath, ffmpeg: ffmpegPath, aria2: aria2cPath }
    const binPath = targetMap[name]
    if (!binPath) return
    const versionFile = path.join(path.dirname(binPath), '.version')
    try {
      fs.writeFileSync(versionFile, tag, 'utf8')
    } catch {}
  }

  /**
   * 从 GitHub Releases 下载并安装工具
   * @param {string} name
   * @returns {Promise<string>} release tag
   */
  async _downloadFromGitHub(name) {
    const repoInfo = TOOL_REPOS[name]
    if (!repoInfo) throw new Error(`未知工具: ${name}`)

    const platform = process.platform === 'win32' ? 'win' : 'linux'
    const patterns = TOOL_ASSET_PATTERNS[name]?.[platform]
    if (!patterns) throw new Error(`${name} 不支持当前平台`)

    // 1. 获取最新 Release
    const release = await this._fetchGitHubRelease(repoInfo.repo)
    if (!release?.assets?.length) throw new Error(`${name} 无可用 Release`)

    // 2. 匹配 Asset
    const asset = this._pickAsset(release.assets, patterns)
    if (!asset) {
      const names = release.assets.map(a => a.name).join(', ')
      throw new Error(`${name} 无匹配 Asset (platform=${platform}), 可用: ${names}`)
    }

    // 3. 下载
    const destDir = path.join(toolDir, name)
    ensureDir(destDir)
    const archivePath = path.join(destDir, asset.name)

    const urls = [asset.browser_download_url]
    // 添加 ghproxy 镜像前缀（ghproxy.cn/<原URL> 风格）
    for (const mirror of TOOL_DOWNLOAD_MIRRORS) {
      urls.push(mirror + asset.browser_download_url)
    }

    await this._tryDownloadUrls(urls, archivePath, name)

    // 4. 解压
    await this._extractArchive(archivePath, destDir, name)

    // 5. 找到二进制并移动到目标位置
    const targetPath = name === 'bbdown' ? bbdownPath
      : name === 'ffmpeg' ? ffmpegPath
      : aria2cPath
    const targetDir = path.dirname(targetPath)
    ensureDir(targetDir)

    const found = this._findBinary(destDir, repoInfo.command)
    if (!found) throw new Error(`${name} 解压后未找到 ${repoInfo.command}`)

    if (found !== targetPath) {
      fs.copyFileSync(found, targetPath)
    }

    // 非 Windows 设置可执行权限
    if (process.platform !== 'win32') {
      try { fs.chmodSync(targetPath, 0o755) } catch {}
    }

    // 6. 清理
    try { fs.unlinkSync(archivePath) } catch {}
    this._cleanupExtracted(destDir, repoInfo.command)

    return release.tag_name
  }

  /**
   * ffmpeg 镜像兜底下载（gyan.dev）
   */
  async _downloadFfmpegMirror() {
    const destDir = path.join(toolDir, 'ffmpeg')
    ensureDir(destDir)
    const archivePath = path.join(destDir, 'ffmpeg-mirror.zip')

    logger?.info(`[LinkFlow] 尝试 gyan.dev 镜像下载 ffmpeg ...`)
    await this._downloadFile(TOOL_FFMPEG_MIRROR_URL, archivePath)
    await this._extractArchive(archivePath, destDir, 'ffmpeg')

    const found = this._findBinary(destDir, 'ffmpeg.exe')
    if (!found) throw new Error('ffmpeg 镜像解压后未找到二进制')

    const targetDir = path.dirname(ffmpegPath)
    ensureDir(targetDir)
    if (found !== ffmpegPath) {
      fs.copyFileSync(found, ffmpegPath)
    }
    if (process.platform !== 'win32') {
      try { fs.chmodSync(ffmpegPath, 0o755) } catch {}
    }

    try { fs.unlinkSync(archivePath) } catch {}
    this._cleanupExtracted(destDir, 'ffmpeg.exe')
  }

  // ==================== media_parser ====================

  /**
   * 确保 media_parser Python 环境就绪
   * @param {boolean} autoInstall
   * @param {boolean} checkUpdate
   */
  async _ensureMediaParser(autoInstall, checkUpdate) {
    const serverPy = path.join(mediaParserDir, 'server.py')
    const submoduleDir = path.join(mediaParserDir, 'astrbot_plugin_media_parser')

    // 检查 server.py 和 submodule 是否存在
    if (!fs.existsSync(serverPy) || !fs.existsSync(submoduleDir)) {
      logger?.warn('[LinkFlow] media_parser 服务文件不完整，跳过')
      this._installed.set('mediaParser', false)
      return
    }

    if (!autoInstall) {
      // 只检查 venv 是否存在
      const venvPython = this._getVenvPython()
      if (fs.existsSync(venvPython)) {
        this._installed.set('mediaParser', true)
      } else {
        logger?.info('[LinkFlow] media_parser venv 不存在且 autoInstall 关闭，跳过')
        this._installed.set('mediaParser', false)
      }
      return
    }

    // 检查是否需要安装/更新
    const needsInstall = checkUpdate
      ? true   // 强制重检指纹
      : await this._mediaParserNeedsInstall()

    if (!needsInstall) {
      this._installed.set('mediaParser', true)
      return
    }

    const action = !fs.existsSync(this._getVenvPython()) ? '安装' : '更新'
    logger?.info(`[LinkFlow] 正在${action} media_parser Python 环境 ...`)
    try {
      await this._setupMediaParserVenv()
      this._installed.set('mediaParser', true)
      logger?.info(`[LinkFlow] media_parser Python 环境${action}完成`)
    } catch (e) {
      logger?.error(`[LinkFlow] media_parser ${action}失败:`, e.message)
      this._installed.set('mediaParser', false)
    }
  }

  // --- media_parser helper methods unchanged ---

  async _mediaParserNeedsInstall() {
    const venvPython = this._getVenvPython()
    if (!fs.existsSync(venvPython)) return true

    const fingerprint = await this._getMediaParserFingerprint()
    const fingerprintFile = path.join(mediaParserDir, '.fingerprint')
    if (fs.existsSync(fingerprintFile)) {
      try {
        const saved = fs.readFileSync(fingerprintFile, 'utf8').trim()
        if (saved === fingerprint) return false
      } catch {}
    }
    return true
  }

  async _getMediaParserFingerprint() {
    const reqFile = path.join(mediaParserDir, 'astrbot_plugin_media_parser', 'requirements.txt')
    let reqHash = ''
    if (fs.existsSync(reqFile)) {
      reqHash = crypto.createHash('sha256').update(fs.readFileSync(reqFile)).digest('hex').slice(0, 16)
    }

    let gitHash = ''
    try {
      const headFile = path.join(mediaParserDir, 'astrbot_plugin_media_parser', '.git', 'HEAD')
      if (fs.existsSync(headFile)) {
        const head = fs.readFileSync(headFile, 'utf8').trim()
        if (head.startsWith('ref: ')) {
          const refFile = path.join(mediaParserDir, 'astrbot_plugin_media_parser', '.git', head.slice(5))
          if (fs.existsSync(refFile)) {
            gitHash = fs.readFileSync(refFile, 'utf8').trim().slice(0, 8)
          }
        } else {
          gitHash = head.slice(0, 8)
        }
      }
    } catch {}

    return `${reqHash}-${gitHash}`
  }

  async _setupMediaParserVenv() {
    const pythonPath = this._findSystemPython()
    if (!pythonPath) throw new Error('未找到系统 Python，请安装 Python 3.9+')

    ensureDir(mediaParserDir)

    logger?.info('[LinkFlow] 创建 Python venv ...')
    await runSpawn(pythonPath, ['-m', 'venv', mediaParserVenvDir], {
      timeout: 60000,
      rejectOnNonZero: true,
    })

    const venvPip = this._getVenvPip()
    const reqFile = path.join(mediaParserDir, 'astrbot_plugin_media_parser', 'requirements.txt')

    if (fs.existsSync(reqFile)) {
      logger?.info('[LinkFlow] pip install 依赖 ...')
      await runSpawn(venvPip, ['install', '-r', reqFile, '--quiet'], {
        timeout: 300000,
        rejectOnNonZero: true,
      })
    }

    const fingerprint = await this._getMediaParserFingerprint()
    fs.writeFileSync(path.join(mediaParserDir, '.fingerprint'), fingerprint, 'utf8')
  }

  _getVenvPython() {
    return process.platform === 'win32'
      ? path.join(mediaParserVenvDir, 'Scripts', 'python.exe')
      : path.join(mediaParserVenvDir, 'bin', 'python')
  }

  _getVenvPip() {
    return process.platform === 'win32'
      ? path.join(mediaParserVenvDir, 'Scripts', 'pip.exe')
      : path.join(mediaParserVenvDir, 'bin', 'pip')
  }

  _findSystemPython() {
    const candidates = process.platform === 'win32'
      ? ['python', 'python3', 'py']
      : ['python3', 'python']

    for (const cmd of candidates) {
      try {
        execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 5000 })
        return cmd
      } catch {}
    }
    return null
  }

  // ==================== GitHub Releases ====================

  async _fetchGitHubRelease(repo) {
    for (const base of TOOL_GITHUB_API_BASES) {
      try {
        const url = `${base}/repos/${repo}/releases/latest`
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(url, {
          headers: { 'User-Agent': 'LinkFlow-Plugin', Accept: 'application/json' },
          timeout: TOOL_API_TIMEOUT_MS,
        })
        if (res.ok) return await res.json()
      } catch {}
    }
    return null
  }

  _pickAsset(assets, patterns) {
    const { include, exclude } = patterns
    const matched = assets.filter(a => include.test(a.name))
    if (!matched.length) return null

    const filtered = exclude
      ? matched.filter(a => !exclude.test(a.name))
      : matched

    filtered.sort((a, b) => a.size - b.size)
    return filtered[0] || matched[0]
  }

  async _tryDownloadUrls(urls, dest, label) {
    for (const url of urls) {
      try {
        await this._downloadFile(url, dest)
        return
      } catch (e) {
        logger?.warn(`[LinkFlow] ${label} 下载失败 (${url}): ${e.message}`)
      }
    }
    throw new Error(`${label} 所有下载源均失败`)
  }

  async _downloadFile(url, dest) {
    const { default: fetch } = await import('node-fetch')
    const res = await fetch(url, {
      timeout: TOOL_DOWNLOAD_TIMEOUT_MS,
      headers: { 'User-Agent': 'LinkFlow-Plugin' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(dest, buffer)
  }

  async _extractArchive(archivePath, destDir, name) {
    const ext = archivePath.toLowerCase()
    logger?.info(`[LinkFlow] 解压 ${name} ...`)

    if (ext.endsWith('.zip')) {
      if (process.platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, {
          timeout: TOOL_EXTRACT_TIMEOUT_MS,
          windowsHide: true,
        })
      } else {
        execSync(`unzip -o -q '${archivePath}' -d '${destDir}'`, { timeout: TOOL_EXTRACT_TIMEOUT_MS })
      }
    } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
      execSync(`tar -xzf '${archivePath}' -C '${destDir}'`, { timeout: TOOL_EXTRACT_TIMEOUT_MS })
    } else if (ext.endsWith('.tar.xz')) {
      execSync(`tar -xJf '${archivePath}' -C '${destDir}'`, { timeout: TOOL_EXTRACT_TIMEOUT_MS })
    } else {
      throw new Error(`不支持的归档格式: ${path.extname(archivePath)}`)
    }
  }

  _findBinary(dir, binaryName) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name === binaryName) {
        return path.join(dir, entry.name)
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = this._findBinary(path.join(dir, entry.name), binaryName)
        if (found) return found
      }
    }
    return null
  }

  _cleanupExtracted(dir, binaryName) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile()) {
        if (entry.name !== binaryName && !entry.name.startsWith('.')) {
          try { fs.unlinkSync(fullPath) } catch {}
        }
      } else if (entry.isDirectory()) {
        const subBinary = this._findBinary(fullPath, binaryName)
        if (subBinary && subBinary !== path.join(dir, binaryName)) {
          try { fs.copyFileSync(subBinary, path.join(dir, binaryName)) } catch {}
        }
        try { fs.rmSync(fullPath, { recursive: true, force: true }) } catch {}
      }
    }
  }
}

/** 单例 */
const toolManager = new ToolManager()

export { toolManager, ToolManager }
