import { startLogin } from '../modules/BiliLogin.js'
import { saveAccountCookies, loadAccountCookies, listBoundAccounts } from '../components/Storage.js'
import { getPluginConfig } from '../components/config.js'
import { render } from '../components/render.js'
import { pluginVersion, yunzaiVersion } from '../components/pluginVersion.js'
import { NAV_URL, DEFAULT_USER_AGENT, LOGIN_POLL_TIMEOUT_SECONDS } from '../components/constants.js'

/**
 * 从配置读取扫码登录超时（秒）
 * @returns {number}
 */
function getPollTimeoutSeconds() {
  try {
    const cfg = getPluginConfig()
    const val = cfg?.login?.pollTimeout
    if (typeof val === 'number' && val > 0) return val
  } catch {}
  return LOGIN_POLL_TIMEOUT_SECONDS
}

/** 冷却控制：每个 QQ 1分钟内只能发起一次登录 */
const cooldowns = new Map()

export class LinkFlowLogin extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]账号登录',
      dsc: 'B站扫码登录（激励领取用）',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#[bB]站登录$/i, fnc: 'cmdPersonalLogin' },
        { reg: /^#[bB]站状态$/i, fnc: 'cmdStatus' },
      ],
    })
  }

  /**
   * #B站登录 — 个人扫码登录（激励领取用）
   */
  async cmdPersonalLogin(e) {
    const last = cooldowns.get(e.user_id)
    if (last && Date.now() - last < 60000) {
      return this.reply('[LinkFlow] 操作太频繁，请1分钟后再试')
    }
    cooldowns.set(e.user_id, Date.now())

    try {
      const loginTimeout = getPollTimeoutSeconds()
      const cookies = await startLogin({
        timeout: loginTimeout,
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
}
