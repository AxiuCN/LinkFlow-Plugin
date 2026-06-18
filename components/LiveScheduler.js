import moment from 'moment'
import common from '../../../lib/common/common.js'
import { getPluginConfig } from './config.js'
import LiveSubStore from './LiveSubStore.js'

/**
 * 直播推送调度器
 * 定时轮询直播间状态 → 检测开播/下播变迁 → 推送消息
 */
class LiveScheduler {
  /**
   * 轮询入口，由 cron 任务调用
   */
  async poll() {
    const cfg = getPluginConfig()
    if (!cfg.livePush?.enabled) return

    const liveData = LiveSubStore.getAll()
    const items = Object.values(liveData)
    if (items.length === 0) return

    const enriched = await LiveSubStore.enrichWithRoomInfo(items)
    if (enriched.length === 0) return

    const sleepMs = (cfg.livePush?.sleep || 0) * 1000
    const rePush = cfg.livePush?.rePush || false
    const endPush = cfg.livePush?.endPush ?? true

    for (const { group, ...roomInfo } of enriched) {
      roomInfo.live_time *= 1000
      const { room_id, live_status, title, area_v2_parent_name, area_v2_name } = roomInfo
      const redisKey = `bililive_${room_id}`
      const raw = await redis.get(redisKey)
      const cached = raw ? JSON.parse(raw) : null
      const changeKey = `${title}-${area_v2_parent_name}-${area_v2_name}`

      if (live_status === 1 && (!cached || (rePush && changeKey !== cached.key))) {
        // 开播：首次推送 / 改标题二次推送
        const { live_time } = roomInfo
        await redis.set(redisKey, JSON.stringify({ live_time, key: changeKey }))

        for (const [groupId, userIds] of Object.entries(group)) {
          await this._sendLiveStart(groupId, userIds, roomInfo, cfg)
          if (sleepMs) await this._sleep(sleepMs)
        }
      } else if (live_status !== 1 && cached) {
        // 下播
        await redis.del(redisKey)

        if (endPush) {
          const { live_time } = cached
          const liveDuration = LiveScheduler._formatDuration(
            moment(live_time),
            moment()
          )

          for (const [groupId, userIds] of Object.entries(group)) {
            await this._sendLiveEnd(groupId, roomInfo, liveDuration, cfg)
            if (sleepMs) await this._sleep(sleepMs)
          }
        }
      }
    }
  }

  /**
   * 推送开播消息
   */
  async _sendLiveStart(groupId, userIds, roomInfo, cfg) {
    const { room_id, cover_from_user, uname, title, uid, area_v2_parent_name, area_v2_name, live_time } = roomInfo
    const userMentions = userIds
      .filter(id => id !== 99999)
      .map(id => segment.at(id === 0 ? 'all' : id))

    const message = [
      ...userMentions,
      segment.image(cover_from_user),
      `昵称: ${uname}\n`,
      `用户uid: ${uid}\n`,
      `标题: ${title}\n`,
      `分区: ${area_v2_parent_name}-${area_v2_name}\n`,
      `开播时间: ${moment(live_time).format('YYYY-MM-DD HH:mm:ss')}\n`,
      `直播间地址: https://live.bilibili.com/${room_id}`,
    ]
    // 彩蛋
    const startHour = moment(live_time).hour()
    if (startHour >= 0 && startHour < 6) message.push('\n逆天小子，这个点你还不去睡')

    if (cfg.livePush?.forward) {
      Bot.pickGroup(Number(groupId)).sendMsg(
        await common.makeForwardMsg({}, [message])
      )
      Bot.pickGroup(Number(groupId)).sendMsg(userMentions)
    } else {
      Bot.pickGroup(Number(groupId)).sendMsg(message)
    }
  }

  /**
   * 推送下播消息
   */
  async _sendLiveEnd(groupId, roomInfo, liveDuration, cfg) {
    const { cover_from_user } = roomInfo
    const message = [
      segment.image(cover_from_user),
      '主播下播la~~~~\n',
      `本次直播时长: ${liveDuration}`,
    ]
    // 彩蛋
    const endHour = moment().hour()
    if (endHour >= 0 && endHour < 6) message.push('\n深夜场结束了？')

    if (cfg.livePush?.forward) {
      Bot.pickGroup(Number(groupId)).sendMsg(
        await common.makeForwardMsg({}, [message])
      )
    } else {
      Bot.pickGroup(Number(groupId)).sendMsg(message)
    }
  }

  /**
   * 格式化直播时长
   * @param {moment} stime 开始时间
   * @param {moment} etime 结束时间
   * @returns {string}
   */
  static _formatDuration(stime, etime) {
    let str = ''
    let dura = etime.format('x') - stime.format('x')
    let tempTime = moment.duration(dura)
    str += tempTime.years() ? tempTime.years() + '年' : ''
    str += tempTime.months() ? tempTime.months() + '月' : ''
    str += tempTime.days() ? tempTime.days() + '日' : ''
    str += tempTime.hours() ? tempTime.hours() + '小时' : ''
    str += tempTime.minutes() ? tempTime.minutes() + '分钟' : ''
    // 彩蛋
    if (dura <= 5 * 60 * 1000) str += `\n(没关系的, ${str}也很厉害了)`
    if (dura > 10 * 60 * 60 * 1000) str += '\n尽职尽责这一块'
    if (dura < 3 * 60 * 1000) str += '\n好吧，我编不下去了，这货连3分钟都不到，唉~'
    return str
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export default new LiveScheduler()
