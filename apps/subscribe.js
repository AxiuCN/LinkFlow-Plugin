import common from '../../../lib/common/common.js'
import { getPluginConfig } from '../components/config.js'
import LiveBiliApi from '../model/LiveApi.js'
import DynamicSubStore from '../modules/subscribe/DynamicSubStore.js'
import DynamicScheduler from '../modules/subscribe/DynamicScheduler.js'
import LiveSubStore from '../modules/livepush/SubStore.js'
import LiveScheduler from '../modules/livepush/Scheduler.js'
import { getUserInfo } from '../model/bilibili/video.js'
import { render } from '../components/render.js'
import { pluginVersion, yunzaiVersion } from '../components/pluginVersion.js'

export class LinkFlowSubscribe extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]订阅管理',
      dsc: 'B站动态/直播订阅推送',
      event: 'message',
      priority: 500,
      rule: [
        // 动态订阅
        { reg: /^#(全体|匿名)?订阅[bB]站UP动态\s+\S+/i, fnc: 'addDynamicSub' },
        { reg: /^#(全体|匿名)?取消[bB]站UP动态\s+\S+/i, fnc: 'delDynamicSub' },
        { reg: /^#动态订阅列表$/i, fnc: 'listDynamicSub' },
        // 直播订阅
        { reg: /^#(全体|匿名)?订阅[bB]站UP直播\s+\S+/i, fnc: 'addLiveSubByUid' },
        { reg: /^#(全体|匿名)?订阅[bB]站UP直播间\s+\S+/i, fnc: 'addLiveSubByRoom' },
        { reg: /^#(全体|匿名)?取消[bB]站UP直播\s+\S+/i, fnc: 'delLiveSubByUid' },
        { reg: /^#(全体|匿名)?取消[bB]站UP直播间\s+\S+/i, fnc: 'delLiveSubByRoom' },
        { reg: /^#直播订阅列表$/i, fnc: 'listLiveSub' },
      ],
    })

    // 动态 cron 任务
    const cfg = getPluginConfig()
    let dynamicCron = cfg?.subscribe?.dynamic?.cron || '0 */23 * * * ?'
    let liveCron = cfg?.subscribe?.live?.cron
    if (!liveCron) liveCron = cfg?.livePush?.cron || '10 * * * * *'

    this.task = [
      {
        name: 'linkflowDynamicPush',
        fnc: () => DynamicScheduler.poll(Bot.uin),
        cron: dynamicCron,
        log: false,
      },
      {
        name: 'linkflowLivePush',
        fnc: () => LiveScheduler.poll(),
        cron: liveCron,
        log: false,
      },
    ]
  }

  // ========== 动态订阅 ==========

  async addDynamicSub(e) {
    let userId = e.user_id
    if (/.*全体.*/.test(e.msg)) userId = 0
    if (/.*匿名.*/.test(e.msg)) userId = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('[LinkFlow] UID格式不对，请输入数字')
    const uid = match[0]
    if (isNaN(uid)) return e.reply('[LinkFlow] UID格式不对，请输入数字')

    // 获取UP主信息
    const userInfo = await getUserInfo(uid)
    if (!userInfo) return e.reply('[LinkFlow] 未找到该UP主，请检查UID是否正确')

    const groupId = e.isGroup ? e.group_id : undefined
    DynamicSubStore.add({
      uid,
      name: userInfo.name,
      group_id: groupId,
      user_id: userId,
      bot_id: Bot.uin,
    })

    return e.reply([
      userInfo.face ? segment.image(userInfo.face) : '',
      `${userInfo.name} 动态订阅成功！`,
    ])
  }

  async delDynamicSub(e) {
    let userId = e.user_id
    if (/.*全体.*/.test(e.msg)) userId = 0
    if (/.*匿名.*/.test(e.msg)) userId = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('[LinkFlow] UID格式不对，请输入数字')
    const uid = match[0]
    if (isNaN(uid)) return e.reply('[LinkFlow] UID格式不对，请输入数字')

    const groupId = e.isGroup ? e.group_id : undefined
    const ok = DynamicSubStore.remove({
      uid,
      group_id: groupId,
      user_id: userId,
      bot_id: Bot.uin,
    })

    if (!ok) return e.reply('[LinkFlow] 你还没有订阅该UP的动态')
    return e.reply('[LinkFlow] 取消UP动态订阅成功！')
  }

  async listDynamicSub(e) {
    const isGroup = e.message_type === 'group'
    let result
    let viewType

    if (isGroup) {
      result = DynamicSubStore.list({ group_id: e.group_id })
      viewType = 'group'
    } else {
      result = DynamicSubStore.list({ user_id: e.user_id })
      viewType = 'private'
    }

    if (!result.length) return e.reply('[LinkFlow] 暂无动态订阅')

    // 渲染 HTML 订阅列表
    const listData = result.map(entry => ({
      uid: entry.uid,
      name: entry.name,
      types: (entry.types || []).map(t => t.replace('DYNAMIC_TYPE_', '')).join('、') || '全部',
    }))

    try {
      const img = await render('subscribe/dynamic', 'list', {
        items: listData,
        count: listData.length,
        viewType,
        version: pluginVersion,
        yunzaiVersion,
      }, 'png')
      return e.reply(img)
    } catch (err) {
      logger?.error('[LinkFlow] 渲染动态列表失败:', err)
      // 文本降级
      const lines = ['[LinkFlow] 动态订阅列表']
      for (const item of listData) {
        lines.push(`${item.name} (UID: ${item.uid}) - ${item.types}`)
      }
      return e.reply(lines.join('\n'))
    }
  }

  // ========== 直播订阅（复用现有 livepush 逻辑） ==========

  async addLiveSubByUid(e) {
    let userId = e.user_id
    if (/.*全体.*/.test(e.msg)) userId = 0
    if (/.*匿名.*/.test(e.msg)) userId = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('[LinkFlow] UID格式不对，请输入数字')
    const uid = match[0]
    if (isNaN(uid)) return e.reply('[LinkFlow] UID格式不对，请输入数字')

    const userInfo = await LiveBiliApi.getRoomInfobyUid(uid)
    if (!userInfo?.room_id) return e.reply('[LinkFlow] 该用户没有直播间')

    const roomInfo = await LiveBiliApi.getRoomInfo(userInfo.room_id)
    if (!roomInfo) return e.reply('[LinkFlow] 获取直播间信息失败')

    await LiveSubStore.add({ uid, room_id: userInfo.room_id, group_id: e.group_id, user_id: userId })
    return e.reply([
      userInfo.face ? segment.image(userInfo.face) : '',
      `${userInfo.uname || '未知用户'} 直播订阅成功！`,
    ])
  }

  async addLiveSubByRoom(e) {
    let userId = e.user_id
    if (/.*全体.*/.test(e.msg)) userId = 0
    if (/.*匿名.*/.test(e.msg)) userId = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('[LinkFlow] 直播间ID格式不对，请输入数字')
    const roomId = match[0]
    if (isNaN(roomId)) return e.reply('[LinkFlow] 直播间ID格式不对，请输入数字')

    const info = await LiveBiliApi.getRoomInfo(roomId)
    if (!info) return e.reply('[LinkFlow] 不存在该直播间')

    const userInfo = await LiveBiliApi.getRoomInfobyUid(info.uid)
    if (!userInfo?.uid) return e.reply('[LinkFlow] 获取主播信息失败')

    await LiveSubStore.add({ uid: String(userInfo.uid), room_id: info.room_id, group_id: e.group_id, user_id: userId })
    return e.reply([
      userInfo.face ? segment.image(userInfo.face) : '',
      `${info.title || '未知标题'} 直播订阅成功！`,
    ])
  }

  async delLiveSubByUid(e) {
    let userId = e.user_id
    if (/.*全体.*/.test(e.msg)) userId = 0
    if (/.*匿名.*/.test(e.msg)) userId = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('[LinkFlow] UID格式不对，请输入数字')
    const uid = match[0]
    if (isNaN(uid)) return e.reply('[LinkFlow] UID格式不对，请输入数字')

    const livedata = LiveSubStore.getRaw().data || {}
    const entry = livedata[uid]
    const gid = String(e.group_id)

    let finalUserId = userId
    if (entry?.group?.[gid]?.filter(i => i === 99999).length === 1) finalUserId = 99999
    if (entry?.group?.[gid]?.filter(i => i === 0).length === 1) finalUserId = 0

    if (!entry?.group?.[gid]?.includes(finalUserId)) {
      return e.reply('[LinkFlow] 你还没有订阅该UP的直播')
    }

    LiveSubStore.remove({ uid, group_id: e.group_id, user_id: finalUserId })
    return e.reply('[LinkFlow] 取消UP直播订阅成功！')
  }

  async delLiveSubByRoom(e) {
    let userId = e.user_id
    if (/.*全体.*/.test(e.msg)) userId = 0
    if (/.*匿名.*/.test(e.msg)) userId = 99999

    const match = /[0-9]+/.exec(e.msg)
    if (!match) return e.reply('[LinkFlow] 直播间ID格式不对，请输入数字')
    const roomId = match[0]
    if (isNaN(roomId)) return e.reply('[LinkFlow] 直播间ID格式不对，请输入数字')

    const info = await LiveBiliApi.getRoomInfo(roomId)
    if (!info) return e.reply('[LinkFlow] 不存在该直播间')

    const uid = String(info.uid)
    const livedata = LiveSubStore.getRaw().data || {}
    const entry = livedata[uid]
    const gid = String(e.group_id)

    let finalUserId = userId
    if (entry?.group?.[gid]?.filter(i => i === 99999).length === 1) finalUserId = 99999
    if (entry?.group?.[gid]?.filter(i => i === 0).length === 1) finalUserId = 0

    if (!entry?.group?.[gid]?.includes(finalUserId)) {
      return e.reply('[LinkFlow] 你还没有订阅该直播间')
    }

    LiveSubStore.remove({ uid, group_id: e.group_id, user_id: finalUserId })
    return e.reply('[LinkFlow] 取消直播间订阅成功！')
  }

  async listLiveSub(e) {
    const isGroup = e.message_type === 'group'

    if (isGroup) {
      const result = LiveSubStore.list({ group_id: e.group_id })
      return this._renderLiveList(e, result, 'users')
    } else {
      const result = LiveSubStore.list({ user_id: e.user_id })
      return this._renderLiveList(e, result, 'groups')
    }
  }

  async _renderLiveList(e, result, key) {
    const enriched = await LiveSubStore.enrichWithRoomInfo(result)
    if (!enriched || enriched.length === 0) return e.reply('[LinkFlow] 暂无直播订阅')

    const msgs = []
    for (const { uid, uname, face, ...item } of enriched) {
      const entries = []
      if (face) entries.push(segment.image(face))
      entries.push(`昵称: ${uname || '未知'}\n`)
      entries.push(`UID: ${uid}\n`)
      const ids = item[key] || []
      entries.push(`订阅${key === 'users' ? '者' : '群'}:\n${ids.map(id => id == 0 ? '全体' : id == 99999 ? '匿名' : id).join('\n')}`)
      msgs.push(entries)
    }

    const forwardMsg = await common.makeForwardMsg(e, msgs)
    e.reply(forwardMsg)
    return true
  }
}
