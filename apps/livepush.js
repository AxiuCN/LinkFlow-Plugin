import common from '../../../lib/common/common.js'
import { getPluginConfig } from '../components/config.js'
import LiveBiliApi from '../model/LiveApi.js'
import LiveSubStore from '../modules/livepush/SubStore.js'
import LiveScheduler from '../modules/livepush/Scheduler.js'

export class BiliLivePush extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]直播订阅',
      dsc: 'B站UP直播订阅推送',
      priority: -114500,
      rule: [
        { reg: /^#?(全体|匿名)?订阅[bB]站([uU][pP])?直播间\s*\d+/i, fnc: 'setLivePush' },
        { reg: /^#?(全体|匿名)?取消[bB]站([uU][pP])?直播间\s*\d+/i, fnc: 'delLivePush' },
        { reg: /^#?(全体|匿名)?订阅[bB]站([uU][pP])?直播\s*\d+/i, fnc: 'setLivePushByUid' },
        { reg: /^#?(全体|匿名)?取消[bB]站([uU][pP])?直播\s*\d+/i, fnc: 'delLivePushByUid' },
        { reg: /^#?(本?群|我的?)?直播订阅(列表|list)?/i, fnc: 'listLivePush' },
      ],
    })

    // 从配置读取 cron，回退到默认值
    let cron = '10 * * * * *'
    try {
      const cfg = getPluginConfig()
      if (cfg.livePush?.cron) cron = cfg.livePush.cron
    } catch (e) { /* 读不到配置则使用默认 cron */ }

    this.task = {
      name: 'biliLivePush',
      fnc: () => LiveScheduler.poll(),
      cron,
      log: false,
    }
  }

  /**
   * 订阅直播间（通过 room_id）
   */
  async setLivePush(e) {
    if (!this._isEnabled()) return true
    if (/.*全体.*/.test(e.msg)) e.user_id = 0
    if (/.*匿名.*/.test(e.msg)) e.user_id = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('直播间ID格式不对！请输入数字。')
    const room_id = match[0]
    if (isNaN(room_id)) return e.reply('直播间ID格式不对！请输入数字。')

    const info = await LiveBiliApi.getRoomInfo(room_id)
    if (!info) return e.reply('不存在该直播间！')

    const { uid, face } = await LiveBiliApi.getRoomInfobyUid(info.uid)
    if (!uid) return e.reply('获取主播信息失败，请稍后再试。')

    await LiveSubStore.add({ uid: String(uid), room_id: info.room_id, group_id: e.group_id, user_id: e.user_id })
    return e.reply([
      face ? segment.image(face) : '',
      `${info.title || '未知标题'} 直播间订阅成功！`,
    ])
  }

  /**
   * 取消订阅直播间（通过 room_id）
   */
  async delLivePush(e) {
    if (!this._isEnabled()) return true
    if (/.*全体.*/.test(e.msg)) e.user_id = 0
    if (/.*匿名.*/.test(e.msg)) e.user_id = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('直播间ID格式不对！请输入数字。')
    const room_id = match[0]
    if (isNaN(room_id)) return e.reply('直播间ID格式不对！请输入数字。')

    const info = await LiveBiliApi.getRoomInfo(room_id)
    if (!info) return e.reply('不存在该直播间！')

    const uid = String(info.uid)
    const livedata = LiveSubStore.getRaw().data || {}
    const entry = livedata[uid]

    // 处理匿名/全体特殊逻辑
    let finalUserId = e.user_id
    const gid = String(e.group_id)
    if (entry?.group?.[gid]?.filter(i => i === 99999).length === 1) finalUserId = 99999
    if (entry?.group?.[gid]?.filter(i => i === 0).length === 1) finalUserId = 0

    if (!entry?.group?.[gid]?.includes(finalUserId)) {
      return e.reply('你还没有订阅该直播间！')
    }

    LiveSubStore.remove({ uid, group_id: e.group_id, user_id: finalUserId })
    return e.reply('取消直播间订阅成功！')
  }

  /**
   * 订阅 UP 主（通过 uid）
   */
  async setLivePushByUid(e) {
    if (!this._isEnabled()) return true
    if (/.*全体.*/.test(e.msg)) e.user_id = 0
    if (/.*匿名.*/.test(e.msg)) e.user_id = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('UID格式不对！请输入数字。')
    const uid = match[0]
    if (isNaN(uid)) return e.reply('UID格式不对！请输入数字。')

    const userInfo = await LiveBiliApi.getRoomInfobyUid(uid)
    if (!userInfo?.room_id) return e.reply('该用户没有直播间！')

    const roomInfo = await LiveBiliApi.getRoomInfo(userInfo.room_id)
    if (!roomInfo) return e.reply('获取直播间信息失败。')

    await LiveSubStore.add({ uid, room_id: userInfo.room_id, group_id: e.group_id, user_id: e.user_id })
    return e.reply([
      userInfo.face ? segment.image(userInfo.face) : '',
      `${userInfo.uname || '未知用户'} 直播间订阅成功！`,
    ])
  }

  /**
   * 取消订阅 UP 主（通过 uid）
   */
  async delLivePushByUid(e) {
    if (!this._isEnabled()) return true
    if (/.*全体.*/.test(e.msg)) e.user_id = 0
    if (/.*匿名.*/.test(e.msg)) e.user_id = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('UID格式不对！请输入数字。')
    const uid = match[0]
    if (isNaN(uid)) return e.reply('UID格式不对！请输入数字。')

    const livedata = LiveSubStore.getRaw().data || {}
    const entry = livedata[uid]

    let finalUserId = e.user_id
    const gid = String(e.group_id)
    if (entry?.group?.[gid]?.filter(i => i === 99999).length === 1) finalUserId = 99999
    if (entry?.group?.[gid]?.filter(i => i === 0).length === 1) finalUserId = 0

    if (!entry?.group?.[gid]?.includes(finalUserId)) {
      return e.reply('你还没有订阅该UP！')
    }

    LiveSubStore.remove({ uid, group_id: e.group_id, user_id: finalUserId })
    return e.reply('取消UP订阅成功！')
  }

  /**
   * 列出订阅
   * #本群直播订阅列表 → 当前群订阅
   * #我的直播订阅列表 → 个人订阅
   * #直播订阅列表 → 无参数时发送两个选项供点击
   */
  async listLivePush(e) {
    if (!this._isEnabled()) return true
    const isGroup = e.message_type === 'group'
    let result, key

    if (/.*群.*/.test(e.msg)) {
      result = LiveSubStore.list({ group_id: e.group_id })
      key = 'users'
    } else if (/.*我.*/.test(e.msg)) {
      result = LiveSubStore.list({ user_id: e.user_id })
      key = 'groups'
    } else if (!isGroup) {
      // 私聊无参数 → 自动展示个人订阅
      result = LiveSubStore.list({ user_id: e.user_id })
      key = 'groups'
    } else {
      // 群聊无参数 → 发送两个选项供点击
      const em = (cmd) => Bot.em('message', {
        self_id: e.self_id,
        message_id: e.message_id,
        user_id: e.user_id,
        sender: e.sender,
        reply: this.reply.bind(this),
        post_type: 'message',
        message_type: 'group',
        sub_type: 'normal',
        message: [{ type: 'text', text: cmd }],
        raw_message: cmd,
      })
      em('#本群直播订阅列表')
      em('#我的直播订阅列表')
      return true
    }

    return this._replyList(e, result, key)
  }

  /**
   * 渲染订阅列表并回复
   * @param {object} e 消息事件
   * @param {Array} _result list() 原始结果
   * @param {string} key 'users'|'groups'
   */
  async _replyList(e, _result, key) {
    const result = await LiveSubStore.enrichWithRoomInfo(_result)
    if (!result || result.length === 0) return e.reply('暂无订阅。')

    const msgs = []
    for (const { uid, uname, face, ...item } of result) {
      const entries = []
      if (face) entries.push(segment.image(face))
      entries.push(`昵称: ${uname || '未知'}\n`)
      entries.push(`用户uid: ${uid}\n`)
      entries.push(`订阅${key}:\n${item[key].map(id => id == 0 ? '全体' : id == 99999 ? '匿名' : id).join('\n')}`)
      msgs.push(entries)
    }

    const forwardMsg = await common.makeForwardMsg(e, msgs)
    e.reply(forwardMsg)
    return true
  }

  /** 检查直播订阅开关（兼容 subscribe.live 和旧版 livePush 路径） */
  _isEnabled() {
    try {
      const cfg = getPluginConfig()
      const enabled = cfg.subscribe?.live?.enabled ?? cfg.livePush?.enabled
      if (enabled === false) {
        this.reply('[LinkFlow] 直播订阅功能已关闭')
        return false
      }
    } catch {}
    return true
  }
}
