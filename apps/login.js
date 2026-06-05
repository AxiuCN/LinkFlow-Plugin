import { doLogin, createClient } from '../components/Claimer.js'
import { loadAccountCookies, listBoundAccounts } from '../components/Storage.js'
import { render } from '../components/render.js'

/** 每个 QQ 独立冷却（1 分钟） */
const loginCooldowns = new Map()

export class BiliLogin extends plugin {
  constructor() {
    super({
      name: '[b站插件]B站账号',
      dsc: 'B站账号登录与状态管理',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#[bB]站登录$/i, fnc: 'cmdLogin' },
        { reg: /^#[bB]站状态$/i, fnc: 'cmdStatus' },
      ],
    })
  }

  /**
   * #B站登录 — 扫码登录，允许多人并发，单人冷却 1 分钟
   */
  async cmdLogin(e) {
    // 单人冷却检查
    const last = loginCooldowns.get(e.user_id)
    if (last && Date.now() - last < 60000) {
      return this.reply('[b站插件] 操作太频繁，请1分钟后再试')
    }
    loginCooldowns.set(e.user_id, Date.now())

    try {
      // 扫码登录，onQR 回调直接渲染并发送 QR 卡片
      await doLogin(e.user_id, {
        onQR: async (url) => {
          const img = await render('qrCode', 'index', {
            url,
            qq: e.user_id,
          }, 'png')
          return this.reply([segment.at(e.user_id), img], false, { recallMsg: 30 })
        },
      })

      return this.reply(`[b站插件] 登录成功 ✓ (已绑定至QQ: ${e.user_id})`)
    } catch (err) {
      return this.reply(`[b站插件] 登录失败: ${err.message}`)
    }
  }

  /**
   * #B站状态 — 查看当前 QQ 的登录态
   */
  async cmdStatus(e) {
    const cookies = loadAccountCookies(e.user_id)
    if (!cookies) {
      const all = listBoundAccounts()
      if (all.length > 0) {
        return this.reply(`[b站插件] 您尚未绑定B站账号。已绑定的账号: ${all.length} 个`)
      }
      return this.reply('[b站插件] 尚未绑定B站账号，请发送 #B站登录')
    }

    try {
      const client = await createClient(e.user_id)
      if (client) {
        await client.ensureLoggedIn()
        return this.reply('[b站插件] B站登录状态: 有效 ✓')
      }
    } catch {
      // 登录失效
    }
    this.reply('[b站插件] B站登录已过期，请重新发送 #B站登录')
  }
}
