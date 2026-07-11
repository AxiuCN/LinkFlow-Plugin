import { BiliClient } from '../model/BiliClient.js'
import DynamicSubStore from '../modules/dynamic/SubStore.js'
import DynamicScheduler from '../modules/dynamic/Scheduler.js'
import { getPluginConfig } from '../components/config.js'
import { DYNAMIC_DEFAULT_CRON } from '../components/constants.js'

export class BiliDynamic extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]动态订阅',
      dsc: 'B站UP主动态订阅推送',
      event: 'message',
      priority: -114500,
      rule: [
        { reg: /^#?(全体|匿名)?订阅[bB]站([uU][pP])?动态\s*\d+/i, fnc: 'cmdSubscribe' },
        { reg: /^#?(全体|匿名)?取消[bB]站([uU][pP])?动态\s*\d+/i, fnc: 'cmdUnsubscribe' },
        { reg: /^#?(本?群|我的?)?动态订阅(列表|list)?/i, fnc: 'cmdList' },
      ],
    })

    // 从配置读取 cron，回退到默认值
    let cron = DYNAMIC_DEFAULT_CRON
    try {
      const cfg = getPluginConfig()
      if (cfg.subscribe?.dynamic?.cron) cron = cfg.subscribe.dynamic.cron
    } catch {}

    this.task = {
      name: 'biliDynamicPush',
      fnc: () => DynamicScheduler.poll(),
      cron,
      log: false,
    }
  }

  /**
   * #订阅b站UP动态 <uid>
   * 固定订阅视频+图文+文章，不含转发和直播
   */
  async cmdSubscribe(e) {
    if (!this._isEnabled()) return true
    if (/.*全体.*/.test(e.msg)) e.user_id = 0
    if (/.*匿名.*/.test(e.msg)) e.user_id = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) {
      return this.reply('[LinkFlow] 请提供UP主UID，如 #订阅B站UP动态 12345')
    }

    const uid = match[0]
    if (isNaN(uid) || uid === '0') {
      return this.reply('[LinkFlow] UID格式无效')
    }

    // 检查是否已登录
    const { getBotCookieString } = await import('../modules/BotCookie.js')
    const botCk = await getBotCookieString()
    if (!botCk) {
      return this.reply('[LinkFlow] Bot尚未绑定B站账号，无法查询UP信息。请主人发送 #机器人B站登录')
    }

    // 查询 UP 信息
    let name = ''
    let face = ''
    try {
      const client = new BiliClient(null, 15, true)
      const infoRes = await client.getUserInfo(uid)
      const data = infoRes?.data || {}
      name = data.name || ''
      face = data.face || ''
    } catch (err) {
      logger?.warn(`[LinkFlow] 查询UP信息失败 uid=${uid}:`, err)
    }

    if (!name) {
      return this.reply(`[LinkFlow] UID ${uid} 查询失败，请确认UID正确且Bot已登录`)
    }

    // 固定订阅：视频、图文、文章
    const types = ['视频', '图文', '文章']

    DynamicSubStore.add({
      uid,
      name,
      face,
      group_id: e.group_id || e.user_id,
      user_id: e.user_id,
      types,
    })

    const replyParts = []
    if (face) replyParts.push(segment.image(face))
    replyParts.push(`${name} (UID: ${uid}) 动态订阅成功（视频/图文/文章）`)

    return this.reply(replyParts)
  }

  /**
   * #取消b站UP动态 <uid>
   */
  async cmdUnsubscribe(e) {
    if (!this._isEnabled()) return true
    if (/.*全体.*/.test(e.msg)) e.user_id = 0
    if (/.*匿名.*/.test(e.msg)) e.user_id = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) {
      return this.reply('[LinkFlow] 请提供UP主UID，如 #取消B站UP动态 12345')
    }

    const uid = match[0]
    if (isNaN(uid) || uid === '0') {
      return this.reply('[LinkFlow] UID格式无效')
    }

    const allData = DynamicSubStore.getAll()
    const entry = allData[String(uid)]
    const gid = String(e.group_id || e.user_id)

    if (!entry?.group?.[gid]) {
      return this.reply('[LinkFlow] 你还没有订阅该UP主的动态')
    }

    // 处理匿名/全体
    let finalUserId = e.user_id
    const existing = entry.group[gid]
    if (existing.filter(i => i.user_id === 99999).length === 1) finalUserId = 99999
    if (existing.filter(i => i.user_id === 0).length === 1) finalUserId = 0

    if (!existing.find(i => i.user_id === finalUserId)) {
      return this.reply('[LinkFlow] 你还没有订阅该UP主的动态')
    }

    DynamicSubStore.remove({ uid, group_id: e.group_id || e.user_id, user_id: finalUserId })
    return this.reply(`[LinkFlow] 已取消 ${entry.name || uid} 的动态订阅`)
  }

  /**
   * #动态订阅列表 — 查看当前群/个人订阅
   */
  async cmdList(e) {
    if (!this._isEnabled()) return true
    const isGroupChat = e.isGroup

    let result, key
    if (/.*群.*/.test(e.msg)) {
      result = DynamicSubStore.list({ group_id: e.group_id })
      key = 'users'
    } else if (/.*我.*/.test(e.msg)) {
      result = DynamicSubStore.list({ user_id: e.user_id })
      key = 'groups'
    } else if (!isGroupChat) {
      result = DynamicSubStore.list({ user_id: e.user_id })
      key = 'groups'
    } else {
      // 群聊无参数 → 发送两个选项
      const em = (cmd) => Bot.em('message', {
        self_id: e.self_id,
        message_id: e.message_id,
        user_id: e.user_id,
        sender: e.sender,
        post_type: 'message',
        message_type: 'group',
        sub_type: 'normal',
        message: [{ type: 'text', text: cmd }],
        raw_message: cmd,
      })
      em('#本群动态订阅列表')
      em('#我的动态订阅列表')
      return true
    }

    if (!result || result.length === 0) {
      return this.reply('[LinkFlow] 暂无动态订阅')
    }

    const msgs = []
    for (const { uid, name, face, users, groups, types } of result) {
      const lines = []
      if (face) lines.push(segment.image(face))
      lines.push(`昵称: ${name || '未知'}\n`)
      lines.push(`UID: ${uid}\n`)
      if (key === 'users' && users) {
        const userLabels = users.map(s => {
          const tp = s.types?.length > 0 ? ` (${s.types.join('/')})` : ''
          if (s.user_id === 0) return `全体${tp}`
          if (s.user_id === 99999) return `匿名${tp}`
          return `${s.user_id}${tp}`
        })
        lines.push(`订阅人: ${userLabels.join(', ')}`)
      }
      if (key === 'groups' && groups) {
        const tp = types?.length > 0 ? ` (${types.join('/')})` : ''
        lines.push(`订阅群: ${groups.join(', ')}${tp}`)
      }
      msgs.push(lines)
    }

    const common = await import('../../../lib/common/common.js')
    const forwardMsg = await common.default.makeForwardMsg(e, msgs)
    this.reply(forwardMsg)
    return true
  }

  /** 检查动态订阅开关 */
  _isEnabled() {
    try {
      const cfg = getPluginConfig()
      if (cfg.subscribe?.dynamic?.enabled === false) {
        this.reply('[LinkFlow] 动态订阅功能已关闭')
        return false
      }
    } catch {}
    return true
  }
}
