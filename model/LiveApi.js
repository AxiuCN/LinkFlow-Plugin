import fetch from 'node-fetch'

/**
 * B站直播公开 API 封装
 * 接口均来自 api.live.bilibili.com，无需 Cookie/SESSDATA
 */
class LiveBiliApi {
  /**
   * 查询单个直播间信息
   * @param {number|string} room_id
   * @returns {Promise<{uid, room_id, online, live_status, user_cover, live_time, title}|null>}
   */
  async getRoomInfo(room_id) {
    try {
      const res = await fetch(
        `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${room_id}`,
        { headers: {} }
      )
      const json = await res.json()
      if (json.code !== 0) {
        logger?.warn(`[LinkFlow] 查询直播间 ${room_id} 失败: ${json.msg || json.message}`)
        return null
      }
      const { uid, online, live_status, user_cover, live_time, title } = json.data
      return { uid, room_id, online, live_status, user_cover, live_time, title }
    } catch (e) {
      logger?.error(`[LinkFlow] 查询直播间 ${room_id} 异常:`, e)
      return null
    }
  }

  /**
   * 通过 UID 查询用户信息（含 room_id 但无直播状态）
   * @param {number|string} uid
   * @returns {Promise<{uid, room_id, uname, face}|null>}
   */
  async getRoomInfobyUid(uid) {
    try {
      const res = await fetch(
        `https://api.live.bilibili.com/live_user/v1/Master/info?uid=${uid}`,
        { headers: {} }
      )
      const json = await res.json()
      if (json.code !== 0) {
        logger?.warn(`[LinkFlow] 查询用户 ${uid} 失败: ${json.msg || json.message}`)
        return null
      }
      const { room_id, info } = json.data
      return { uid, room_id, uname: info?.uname, face: info?.face }
    } catch (e) {
      logger?.error(`[LinkFlow] 查询用户 ${uid} 异常:`, e)
      return null
    }
  }

  /**
   * 批量通过 UIDs 查询直播间状态
   * 返回的每个房间包含完整信息（标题、分区、开播状态等）
   * @param {Array<number|string>} uids
   * @returns {Promise<object>} { uid: { room_id, uname, face, live_status, live_time, title,
   *                            online, user_cover, area_v2_name, area_v2_parent_name, ... } }
   */
  async getRoomInfobyUids(uids) {
    try {
      const res = await fetch(
        'https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uids: uids.map(item => parseInt(item)) }),
        }
      )
      const json = await res.json()
      if (json.code !== 0) {
        logger?.warn(`[LinkFlow] 批量查询直播间失败: ${json.msg || json.message}`)
        return null
      }
      return json.data
    } catch (e) {
      logger?.error('[LinkFlow] 批量查询直播间异常:', e)
      return null
    }
  }
}

export default new LiveBiliApi()
