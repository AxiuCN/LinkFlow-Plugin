import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import fetch from 'node-fetch'
import { runSpawn, exists, ensureDir } from '../components/utils.js'
import {
  mediaParserDir,
  mediaParserVenvDir,
  mediaParserServerPath,
  ffmpegPath,
  downloadCacheDir,
  botAccountsDir,
  MEDIA_PARSER_DEFAULT_PORT,
  MEDIA_PARSER_STARTUP_TIMEOUT_MS,
  MEDIA_PARSER_RESTART_LIMIT,
  MEDIA_PARSER_RESTART_WINDOW_MS,
} from '../components/constants.js'
import { loadBotCookies, formatCookiesText } from './bilibili/auth.js'

/**
 * MediaParser — Python media_parser HTTP 服务客户端
 *
 * 管理一个本地 Python HTTP 微服务（tool/media_parser/server.py），
 * 提供 /parse /download /health 接口，支持 10 个平台的链接解析和下载。
 *
 * 生命周期：start() → parse()/download() → stop()
 */

class MediaParser {
  constructor() {
    /** @type {import('node:child_process').ChildProcess|null} */
    this._process = null
    this._port = MEDIA_PARSER_DEFAULT_PORT
    this._pythonPath = 'python'
    this._started = false

    // 崩溃重启控制
    this._restartCount = 0
    this._restartWindowStart = 0
  }

  /**
   * 配置并启动 media_parser 服务
   * @param {object} [opts]
   * @param {string} [opts.pythonPath] - Python 可执行路径
   * @param {number} [opts.port] - 监听端口
   * @returns {Promise<boolean>} 是否启动成功
   */
  async start(opts = {}) {
    if (this._started && await this.health()) return true

    this._port = opts.port || MEDIA_PARSER_DEFAULT_PORT
    this._pythonPath = opts.pythonPath || this._findVenvPython() || 'python'

    // 检查 server.py 存在
    if (!fs.existsSync(mediaParserServerPath)) {
      logger?.warn('[LinkFlow] media_parser server.py 不存在，跳过启动')
      return false
    }

    logger?.info(`[LinkFlow] 启动 media_parser 服务 (port=${this._port}) ...`)

    try {
      await this._spawnServer()
      this._started = true
      logger?.info('[LinkFlow] media_parser 服务启动成功')
      return true
    } catch (e) {
      logger?.error(`[LinkFlow] media_parser 服务启动失败: ${e.message}`)
      return false
    }
  }

  /**
   * 停止 media_parser 服务
   */
  async stop() {
    this._started = false
    if (this._process) {
      try {
        this._process.kill()
      } catch {}
      this._process = null
    }
  }

  /**
   * 健康检查
   * @returns {Promise<object|null>} {status, platforms} 或 null
   */
  async health() {
    try {
      const res = await fetch(`http://127.0.0.1:${this._port}/health`, {
        timeout: 5000,
      })
      if (res.ok) return await res.json()
    } catch {}
    return null
  }

  /**
   * 解析文本中的链接
   * @param {string} text - 包含链接的文本
   * @param {object} [opts]
   * @param {string} [opts.cookie] - Cookie 字符串
   * @returns {Promise<Array|null>} 解析结果列表
   */
  async parse(text, opts = {}) {
    try {
      const cookie = opts.cookie || this._getBotCookieString()
      const res = await fetch(`http://127.0.0.1:${this._port}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, cookie }),
        timeout: 120000,
      })

      if (!res.ok) {
        const err = await res.text()
        logger?.error(`[LinkFlow] media_parser parse 失败: ${err}`)
        return null
      }

      return await res.json()
    } catch (e) {
      logger?.error(`[LinkFlow] media_parser parse 请求失败: ${e.message}`)
      return null
    }
  }

  /**
   * 下载解析后的媒体
   * @param {object} metadata - 解析结果（来自 parse）
   * @param {object} [opts]
   * @param {number} [opts.maxSizeMb] - 最大文件大小 MB
   * @param {string} [opts.cookie] - Cookie 字符串
   * @returns {Promise<object|null>} 下载结果
   */
  async download(metadata, opts = {}) {
    try {
      const cookie = opts.cookie || this._getBotCookieString()
      const res = await fetch(`http://127.0.0.1:${this._port}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata,
          max_size_mb: opts.maxSizeMb || 0,
          cookie,
        }),
        timeout: 600000,
      })

      if (!res.ok) {
        const err = await res.text()
        logger?.error(`[LinkFlow] media_parser download 失败: ${err}`)
        return null
      }

      return await res.json()
    } catch (e) {
      logger?.error(`[LinkFlow] media_parser download 请求失败: ${e.message}`)
      return null
    }
  }

  /**
   * 服务是否已启动
   * @returns {boolean}
   */
  isStarted() {
    return this._started
  }

  // ==================== 内部方法 ====================

  /**
   * Spawn Python 服务进程
   */
  async _spawnServer() {
    const args = [
      mediaParserServerPath,
      '--host', '127.0.0.1',
      '--port', String(this._port),
    ]

    // 传递 ffmpeg 路径
    if (fs.existsSync(ffmpegPath)) {
      args.push('--ffmpeg-path', ffmpegPath)
    }

    // 传递 Cookie 文件
    const cookieFile = await this._createCookieFile()
    if (cookieFile) {
      args.push('--cookie-file', cookieFile)
    }

    this._process = spawn(this._pythonPath, args, {
      cwd: mediaParserDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // 捕获输出到日志
    const logStream = fs.createWriteStream(
      path.join(mediaParserDir, 'server-stdout.log'),
      { flags: 'a' }
    )
    this._process.stdout?.on('data', d => {
      logStream.write(d)
    })
    this._process.stderr?.on('data', d => {
      logStream.write(d)
    })

    // 进程退出处理
    this._process.on('close', (code) => {
      logStream.end()
      if (this._started) {
        logger?.warn(`[LinkFlow] media_parser 服务退出 (code=${code})`)
        this._tryRestart()
      }
    })

    this._process.on('error', (err) => {
      logStream.end()
      logger?.error(`[LinkFlow] media_parser 服务启动异常: ${err.message}`)
    })

    // 等待 /health 就绪
    const deadline = Date.now() + MEDIA_PARSER_STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
      const h = await this.health()
      if (h) return
      await new Promise(r => setTimeout(r, 1000))
    }

    throw new Error('media_parser 服务启动超时')
  }

  /**
   * 崩溃后自动重启
   */
  async _tryRestart() {
    const now = Date.now()
    if (now - this._restartWindowStart > MEDIA_PARSER_RESTART_WINDOW_MS) {
      this._restartCount = 0
      this._restartWindowStart = now
    }

    this._restartCount++
    if (this._restartCount > MEDIA_PARSER_RESTART_LIMIT) {
      logger?.error(`[LinkFlow] media_parser 重启次数超过限制 (${MEDIA_PARSER_RESTART_LIMIT}次/${MEDIA_PARSER_RESTART_WINDOW_MS / 1000}秒)，不再重试`)
      this._started = false
      return
    }

    logger?.info(`[LinkFlow] media_parser 自动重启 (${this._restartCount}/${MEDIA_PARSER_RESTART_LIMIT}) ...`)
    try {
      await this._spawnServer()
    } catch (e) {
      logger?.error(`[LinkFlow] media_parser 重启失败: ${e.message}`)
    }
  }

  /**
   * 查找 venv 中的 Python
   * @returns {string|null}
   */
  _findVenvPython() {
    const venvPython = process.platform === 'win32'
      ? path.join(mediaParserVenvDir, 'Scripts', 'python.exe')
      : path.join(mediaParserVenvDir, 'bin', 'python')

    return fs.existsSync(venvPython) ? venvPython : null
  }

  /**
   * 获取 bot Cookie 字符串
   * @returns {string}
   */
  _getBotCookieString() {
    const cookies = loadBotCookies()
    return cookies ? formatCookiesText(cookies) : ''
  }

  /**
   * 创建 Netscape 格式 Cookie 文件（供 Python 服务使用）
   * @returns {Promise<string|null>}
   */
  async _createCookieFile() {
    const ckPath = path.join(botAccountsDir, 'bilibili.json')
    if (!fs.existsSync(ckPath)) return null

    try {
      const payload = JSON.parse(fs.readFileSync(ckPath, 'utf8'))
      const cookies = payload?.cookies
      if (!cookies) return null

      const cookieFile = path.join(mediaParserDir, '.bili_cookies.txt')
      const lines = ['# Netscape HTTP Cookie File']
      for (const [name, value] of Object.entries(cookies)) {
        lines.push(`.bilibili.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}`)
      }
      fs.writeFileSync(cookieFile, lines.join('\n'), 'utf8')
      return cookieFile
    } catch {
      return null
    }
  }
}

/** 单例 */
const mediaParser = new MediaParser()

export { mediaParser, MediaParser }
