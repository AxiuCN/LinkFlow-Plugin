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
  TOOL_DOWNLOAD_TIMEOUT_MS,
  TOOL_FFMPEG_MIRROR_URL,
} from './constants.js'
import { runSpawn, exists, ensureDir } from './utils.js'

/**
 * ToolManager — 统一管理外部工具（bbdown / ffmpeg / aria2 / media_parser）
 *
 * 二进制工具（bbdown/ffmpeg/aria2）通过 GitHub Releases API 下载
 * media_parser 通过 Python venv + pip 安装依赖
 */
class ToolManager {
  constructor() {
    this._installed = new Map()
  }

  /**
   * 检查并安装所有已启用的工具
   * @param {object} [toolCfg] - tool 配置段
   */
  async ensureAll(toolCfg = {}) {
    const autoInstall = toolCfg.autoInstall !== false

    if (toolCfg.bbdown?.enabled !== false) {
      await this._ensureBinary('bbdown', autoInstall)
    }
    if (toolCfg.ffmpeg?.enabled !== false) {
      await this._ensureBinary('ffmpeg', autoInstall)
    }
    if (toolCfg.aria2?.enabled !== false) {
      await this._ensureBinary('aria2', autoInstall)
    }
    if (toolCfg.mediaParser?.enabled !== false) {
      await this._ensureMediaParser(autoInstall)
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
   */
  async _ensureBinary(name, autoInstall) {
    const binPath = this.getToolPath(name)
    if (binPath) {
      this._installed.set(name, true)
      return
    }

    if (!autoInstall) {
      logger?.info(`[LinkFlow] ${name} 未安装且 autoInstall 关闭，跳过`)
      return
    }

    logger?.info(`[LinkFlow] 正在安装 ${name} ...`)
    try {
      await this._downloadFromGitHub(name)
      this._installed.set(name, true)
      logger?.info(`[LinkFlow] ${name} 安装完成`)
    } catch (e) {
      logger?.error(`[LinkFlow] ${name} 安装失败:`, e.message)
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
   * 从 GitHub Releases 下载并安装工具
   * @param {string} name
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
    // 添加 ghproxy 镜像
    for (const base of TOOL_GITHUB_API_BASES.slice(1)) {
      urls.push(asset.browser_download_url.replace('https://github.com', base.replace('/https://api.github.com', '')))
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
   */
  async _ensureMediaParser(autoInstall) {
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
    const needsInstall = await this._mediaParserNeedsInstall()
    if (!needsInstall) {
      this._installed.set('mediaParser', true)
      return
    }

    logger?.info('[LinkFlow] 正在安装 media_parser Python 环境 ...')
    try {
      await this._setupMediaParserVenv()
      this._installed.set('mediaParser', true)
      logger?.info('[LinkFlow] media_parser Python 环境安装完成')
    } catch (e) {
      logger?.error('[LinkFlow] media_parser 安装失败:', e.message)
      this._installed.set('mediaParser', false)
    }
  }

  /**
   * 检查 media_parser 是否需要安装/更新
   * @returns {Promise<boolean>}
   */
  async _mediaParserNeedsInstall() {
    const venvPython = this._getVenvPython()
    if (!fs.existsSync(venvPython)) return true

    // 指纹校验
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

  /**
   * 计算 media_parser 依赖指纹
   * @returns {Promise<string>}
   */
  async _getMediaParserFingerprint() {
    const reqFile = path.join(mediaParserDir, 'astrbot_plugin_media_parser', 'requirements.txt')
    let reqHash = ''
    if (fs.existsSync(reqFile)) {
      reqHash = crypto.createHash('sha256').update(fs.readFileSync(reqFile)).digest('hex').slice(0, 16)
    }

    // git commit hash
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

  /**
   * 创建 venv 并安装依赖
   */
  async _setupMediaParserVenv() {
    const pythonPath = this._findSystemPython()
    if (!pythonPath) throw new Error('未找到系统 Python，请安装 Python 3.9+')

    ensureDir(mediaParserDir)

    // 创建 venv
    logger?.info('[LinkFlow] 创建 Python venv ...')
    await runSpawn(pythonPath, ['-m', 'venv', mediaParserVenvDir], {
      timeout: 60000,
      rejectOnNonZero: true,
    })

    // pip install
    const venvPip = this._getVenvPip()
    const reqFile = path.join(mediaParserDir, 'astrbot_plugin_media_parser', 'requirements.txt')

    if (fs.existsSync(reqFile)) {
      logger?.info('[LinkFlow] pip install 依赖 ...')
      await runSpawn(venvPip, ['install', '-r', reqFile, '--quiet'], {
        timeout: 300000,
        rejectOnNonZero: true,
      })
    }

    // 写指纹
    const fingerprint = await this._getMediaParserFingerprint()
    fs.writeFileSync(path.join(mediaParserDir, '.fingerprint'), fingerprint, 'utf8')
  }

  /**
   * 获取 venv 中的 Python 路径
   * @returns {string}
   */
  _getVenvPython() {
    return process.platform === 'win32'
      ? path.join(mediaParserVenvDir, 'Scripts', 'python.exe')
      : path.join(mediaParserVenvDir, 'bin', 'python')
  }

  /**
   * 获取 venv 中的 pip 路径
   * @returns {string}
   */
  _getVenvPip() {
    return process.platform === 'win32'
      ? path.join(mediaParserVenvDir, 'Scripts', 'pip.exe')
      : path.join(mediaParserVenvDir, 'bin', 'pip')
  }

  /**
   * 查找系统 Python
   * @returns {string|null}
   */
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

  /**
   * 从 GitHub API 获取最新 Release
   * @param {string} repo - 如 'nilaoda/BBDown'
   * @returns {Promise<object|null>}
   */
  async _fetchGitHubRelease(repo) {
    for (const base of TOOL_GITHUB_API_BASES) {
      try {
        const url = `${base}/repos/${repo}/releases/latest`
        const { default: fetch } = await import('node-fetch')
        const res = await fetch(url, {
          headers: { 'User-Agent': 'LinkFlow-Plugin', Accept: 'application/json' },
          timeout: 15000,
        })
        if (res.ok) return await res.json()
      } catch {}
    }
    return null
  }

  /**
   * 从 Release Assets 中选择最佳匹配
   * @param {Array} assets
   * @param {object} patterns - { include, exclude }
   * @returns {object|null}
   */
  _pickAsset(assets, patterns) {
    const { include, exclude } = patterns
    // 精确匹配：先按 include 正则打分
    const matched = assets.filter(a => include.test(a.name))
    if (!matched.length) return null

    // 排除
    const filtered = exclude
      ? matched.filter(a => !exclude.test(a.name))
      : matched

    // 优先选最小的（通常不含多余文件）
    filtered.sort((a, b) => a.size - b.size)
    return filtered[0] || matched[0]
  }

  /**
   * 尝试多个 URL 下载，首个成功即返回
   * @param {string[]} urls
   * @param {string} dest
   * @param {string} label
   */
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

  /**
   * 下载文件到本地
   * @param {string} url
   * @param {string} dest
   */
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

  /**
   * 解压归档文件
   * @param {string} archivePath
   * @param {string} destDir
   * @param {string} name - 工具名（日志用）
   */
  async _extractArchive(archivePath, destDir, name) {
    const ext = archivePath.toLowerCase()
    logger?.info(`[LinkFlow] 解压 ${name} ...`)

    if (ext.endsWith('.zip')) {
      if (process.platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, {
          timeout: TOOL_DOWNLOAD_TIMEOUT_MS,
          windowsHide: true,
        })
      } else {
        execSync(`unzip -o -q '${archivePath}' -d '${destDir}'`, { timeout: TOOL_DOWNLOAD_TIMEOUT_MS })
      }
    } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
      execSync(`tar -xzf '${archivePath}' -C '${destDir}'`, { timeout: TOOL_DOWNLOAD_TIMEOUT_MS })
    } else if (ext.endsWith('.tar.xz')) {
      execSync(`tar -xJf '${archivePath}' -C '${destDir}'`, { timeout: TOOL_DOWNLOAD_TIMEOUT_MS })
    } else {
      throw new Error(`不支持的归档格式: ${path.extname(archivePath)}`)
    }
  }

  /**
   * 递归查找二进制文件
   * @param {string} dir
   * @param {string} binaryName - 如 'BBDown.exe'
   * @returns {string|null}
   */
  _findBinary(dir, binaryName) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    // 先在当前目录找
    for (const entry of entries) {
      if (entry.isFile() && entry.name === binaryName) {
        return path.join(dir, entry.name)
      }
    }
    // 递归子目录
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = this._findBinary(path.join(dir, entry.name), binaryName)
        if (found) return found
      }
    }
    return null
  }

  /**
   * 清理解压产生的多余文件（保留二进制）
   * @param {string} dir
   * @param {string} binaryName
   */
  _cleanupExtracted(dir, binaryName) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile()) {
        if (entry.name !== binaryName && !entry.name.startsWith('.')) {
          try { fs.unlinkSync(fullPath) } catch {}
        }
      } else if (entry.isDirectory()) {
        // 递归清理子目录
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
