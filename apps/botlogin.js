import { botLogin, botLogout, botStatus } from '../modules/BotCookie.js'
import { render } from '../components/render.js'
import { pluginVersion, yunzaiVersion } from '../components/pluginVersion.js'
import { LOGIN_POLL_TIMEOUT_SECONDS } from '../components/constants.js'

export class BotBiliLogin extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]机器人B站登录',
      dsc: 'Bot B站账号扫码登录（动态订阅用）',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#机器人[bB]站登录$/i, fnc: 'cmdLogin' },
        { reg: /^#机器人[bB]站状态$/i, fnc: 'cmdStatus' },
        { reg: /^#机器人[bB]站登出$/i, fnc: 'cmdLogout' },
      ],
    })
  }

  /**
   * #机器人B站登录 — 扫码绑定 bot B站账号
   * 仅主人且私聊使用
   */
  async cmdLogin(e) {
    if (!e.isMaster) {
      return this.reply('[LinkFlow] 仅限主人使用')
    }

    if (!e.isPrivate) {
      return this.reply('[LinkFlow] 请私聊使用此命令，避免二维码泄露')
    }

    // 先检查是否已登录
    const existing = await botStatus()
    if (existing.isLogin) {
      return this.reply(`[LinkFlow] Bot 已登录: ${existing.uname} (UID: ${existing.mid})\n如需重新登录，请先发送 #机器人B站登出`)
    }

    let scanned = false

    try {
      const cookies = await botLogin(
        // onQR: 渲染二维码图片并发送
        async (url) => {
          const img = await render('qrCode', 'index', {
            url,
            qq: 'Bot',
            version: pluginVersion,
            yunzaiVersion,
          }, 'png')
          this.reply([segment.at(e.user_id), '请用B站客户端扫码，有效期3分钟', img], false, { recallMsg: 0 })
        },
        // onScanned: 扫码成功提示
        () => {
          if (!scanned) {
            scanned = true
            this.reply('[LinkFlow] 已扫码，请在手机上确认登录...')
          }
        },
        LOGIN_POLL_TIMEOUT_SECONDS,
      )

      // 查询昵称
      const status = await botStatus()
      const nameHint = status.uname ? ` (${status.uname})` : ''
      this.reply(`[LinkFlow] Bot B站账号绑定成功 ✓${nameHint}`)
    } catch (err) {
      this.reply(`[LinkFlow] Bot 登录失败: ${err.message}`)
    }
  }

  /**
   * #机器人B站状态 — 查看 bot 登录态
   */
  async cmdStatus(e) {
    if (!e.isMaster) return false

    const status = await botStatus()
    if (status.isLogin) {
      this.reply(`[LinkFlow] Bot B站登录状态: 有效 ✓\n昵称: ${status.uname}\nUID: ${status.mid}`)
    } else {
      this.reply('[LinkFlow] Bot 尚未绑定B站账号\n发送 #机器人B站登录 绑定（请私聊）')
    }
  }

  /**
   * #机器人B站登出 — 登出并清除 bot Cookie
   */
  async cmdLogout(e) {
    if (!e.isMaster) return false

    await botLogout()
    this.reply('[LinkFlow] Bot B站已登出，Cookie 已清除')
  }
}
