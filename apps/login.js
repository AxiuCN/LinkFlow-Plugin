import { doLogin, createClient } from '../components/Claimer.js'
import { loadAccountCookies, listBoundAccounts } from '../components/Storage.js'
import { render } from '../components/render.js'

let loginInProgress = false

export class BiliLogin extends plugin {
  constructor() {
    super({
      name: '[B站插件]B站账号',
      dsc: 'B站账号登录与状态管理',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#B站登录$', fnc: 'cmdLogin' },
        { reg: '^#B站状态$', fnc: 'cmdStatus' },
      ],
    })
  }

  /**
   * #B站登录 — 扫码登录B站，绑定至当前QQ
   * 流程：生成二维码 → 渲染美化卡片 → 发送（30秒撤回）→ 静默轮询 → 回复结果
   */
  async cmdLogin(e) {
    if (loginInProgress) {
      return this.reply('[B站插件] 已有登录流程进行中，请稍后重试')
    }
    loginInProgress = true

    try {
      await this.reply('[B站插件] 正在生成登录二维码...')

      await doLogin(e.user_id, {
        // 收到二维码 URL 后渲染美化卡片并发送
        onQR: async (url) => {
          const img = await render('qrCode', 'index', {
            url,
            qq: e.user_id,
          }, 'png')
          // 发送 QR 卡片，30 秒后自动撤回
          return this.reply([segment.at(e.user_id), img], false, { recallMsg: 30 })
        },
      })

      return this.reply(`[B站插件] 登录成功 ✓ (已绑定至QQ: ${e.user_id})`)
    } catch (err) {
      return this.reply(`[B站插件] 登录失败: ${err.message}`)
    } finally {
      loginInProgress = false
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
        return this.reply(`[B站插件] 您尚未绑定B站账号。已绑定的账号: ${all.length} 个`)
      }
      return this.reply('[B站插件] 尚未绑定B站账号，请发送 #B站登录')
    }

    try {
      const client = await createClient(e.user_id)
      if (client) {
        await client.ensureLoggedIn()
        return this.reply('[B站插件] B站登录状态: 有效 ✓')
      }
    } catch {
      // 登录失效
    }
    this.reply('[B站插件] B站登录已过期，请重新发送 #B站登录')
  }
}
