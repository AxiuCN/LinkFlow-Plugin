import path from 'node:path'
import fs from 'node:fs'
import { startLogin, saveBotCookies, saveAccountCookies, loadAccountCookies, listBoundAccounts } from '../model/bilibili/auth.js'
import { login as bbdownLogin } from '../model/BBDown.js'
import { toolManager } from '../components/ToolManager.js'
import { getPluginConfig } from '../components/config.js'
import { render } from '../components/render.js'
import { pluginVersion, yunzaiVersion } from '../components/pluginVersion.js'
import { NAV_URL, DEFAULT_USER_AGENT, bbdownPath } from '../components/constants.js'

/** 冷却控制：每个 QQ 1分钟内只能发起一次登录 */
const cooldowns = new Map()

export class LinkFlowLogin extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]账号登录',
      dsc: 'B站扫码登录（机器人公共/个人）+ 工具环境初始化',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#机器人[bB]站登录$/i, fnc: 'cmdBotLogin' },
        { reg: /^#[bB]站登录$/i, fnc: 'cmdPersonalLogin' },
        { reg: /^#[bB]站状态$/i, fnc: 'cmdStatus' },
        { reg: /^#初始化工具环境$/i, fnc: 'cmdInitTools' },
      ],
    })
  }

  /**
   * #机器人b站登录 — BBDown 扫码登录 + 同步 Cookie 到机器人账号
   *
   * BBDown 负责生码/扫码，成功后自动提取 SESSDATA 等字段存入
   * data/bot_accounts/bilibili.json，保留机器人账号体系供激励/下载等模块使用。
   */
  async cmdBotLogin(e) {
    if (!e.isMaster) {
      return this.reply('[LinkFlow] 仅 bot 主人可绑定机器人公共账号')
    }

    const key = `bot_${e.user_id}`
    const last = cooldowns.get(key)
    if (last && Date.now() - last < 60000) {
      return this.reply('[LinkFlow] 操作太频繁，请1分钟后再试')
    }
    cooldowns.set(key, Date.now())

    // 检查 BBDown 是否已安装
    if (!fs.existsSync(bbdownPath)) {
      return this.reply('[LinkFlow] BBDown 未安装，请先发送 #初始化工具环境')
    }

    try {
      // 使用 BBDown 扫码登录
      const success = await bbdownLogin(e, {
        onQR: async (qrPath) => {
          // BBDown 生成 qrcode.png，直接发送图片
          await this.reply([
            segment.at(e.user_id),
            segment.text('\n[LinkFlow] 请用 B站 APP 扫码登录机器人账号\n'),
            segment.image('file://' + qrPath),
          ], false, { recallMsg: 30 })
        },
      })

      if (success) {
        return this.reply('[LinkFlow] 机器人公共 B站账号绑定成功 ✓')
      } else {
        return this.reply('[LinkFlow] 机器人登录失败')
      }
    } catch (err) {
      return this.reply(`[LinkFlow] 机器人登录失败: ${err.message}`)
    }
  }

  /**
   * #B站登录 — 个人扫码登录（激励领取用）
   * 保留 B站 QR API 方式，独立于 BBDown
   */
  async cmdPersonalLogin(e) {
    const last = cooldowns.get(e.user_id)
    if (last && Date.now() - last < 60000) {
      return this.reply('[LinkFlow] 操作太频繁，请1分钟后再试')
    }
    cooldowns.set(e.user_id, Date.now())

    try {
      const cookies = await startLogin({
        onQR: async (url) => {
          const img = await render('qrCode', 'index', {
            url,
            qq: e.user_id,
            version: pluginVersion,
            yunzaiVersion,
          }, 'png')
          return this.reply([segment.at(e.user_id), img], false, { recallMsg: 30 })
        },
      })
      saveAccountCookies(e.user_id, cookies)
      return this.reply(`[LinkFlow] 个人 B站账号绑定成功 ✓ (QQ: ${e.user_id})`)
    } catch (err) {
      return this.reply(`[LinkFlow] 登录失败: ${err.message}`)
    }
  }

  /**
   * #B站状态 — 查看当前 QQ 的个人登录态
   */
  async cmdStatus(e) {
    const cookies = loadAccountCookies(e.user_id)
    if (!cookies) {
      const all = listBoundAccounts()
      if (all.length > 0) {
        return this.reply(`[LinkFlow] 您尚未绑定B站账号\n当前已有 ${all.length} 个账号绑定`)
      }
      return this.reply('[LinkFlow] 您尚未绑定B站账号\n发送 #B站登录 绑定个人账号')
    }

    try {
      const { default: fetch } = await import('node-fetch')
      const res = await fetch(NAV_URL, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Referer: 'https://www.bilibili.com/',
          Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
        },
      })
      const payload = await res.json()
      if (payload?.data?.isLogin) {
        return this.reply(`[LinkFlow] B站登录状态: 有效 ✓\nQQ: ${e.user_id}`)
      }
    } catch {}

    this.reply('[LinkFlow] B站登录已过期，请重新发送 #B站登录')
  }

  /**
   * #初始化工具环境 — 自动检查并安装 BBDown / ffmpeg / aria2 / media_parser
   */
  async cmdInitTools(e) {
    if (!e.isMaster) {
      return this.reply('[LinkFlow] 仅 bot 主人可初始化工具环境')
    }

    const config = getPluginConfig()
    const toolCfg = config?.tool || {}

    await this.reply('[LinkFlow] 正在检查工具环境 ...')

    try {
      await toolManager.ensureAll(toolCfg)

      const labels = { bbdown: 'BBDown', ffmpeg: 'ffmpeg', aria2: 'aria2', mediaParser: 'media_parser' }
      const status = Object.entries(labels).map(
        ([name, display]) => `${toolManager.isInstalled(name) ? '✓' : '✗'} ${display}`
      )

      await this.reply(`[LinkFlow] 工具环境检查完成:\n${status.join('\n')}`)
    } catch (err) {
      await this.reply(`[LinkFlow] 工具初始化失败: ${err.message}`)
    }
  }
}
