import fs from 'node:fs'
import path from 'node:path'
import { pluginData } from '../../components/constants.js'
import LiveBiliApi from '../../model/LiveApi.js'

/** 订阅数据文件路径 */
const DATA_FILE = path.join(pluginData, 'live_bili.json')
const CURRENT_VERSION = 1

/**
 * 订阅数据管理
 * 数据结构: { version, data: { uid → { uid, room_id, group: { 群号 → [QQ列表] } } } }
 * user_id 语义: 0 = @全体, 99999 = 匿名
 */
class LiveSubStore {
  /**
   * 读取完整订阅数据
   * @returns {{ version: number, data: object }}
   */
  getRaw() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      }
    } catch (e) {
      logger?.error('[LinkFlow] 读取直播订阅数据失败:', e)
    }
    return { version: CURRENT_VERSION, data: {} }
  }

  /**
   * 写入完整订阅数据
   * @param {object} raw
   */
  _write(raw) {
    try {
      const dir = path.dirname(DATA_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(DATA_FILE, JSON.stringify(raw, null, '\t'), 'utf8')
    } catch (e) {
      logger?.error('[LinkFlow] 写入直播订阅数据失败:', e)
    }
  }

  /**
   * 添加订阅
   * 若 uid 不存在则通过 API 补全 room_id
   * @param {{ uid?: string, room_id?: string|number, group_id: string|number, user_id: string|number }} data
   * @returns {Promise<boolean>} 是否成功
   */
  async add(data) {
    let { uid, room_id, group_id, user_id } = data

    // 若只提供了 room_id，通过 API 补全 uid
    if (!uid && room_id) {
      const info = await LiveBiliApi.getRoomInfo(room_id)
      if (!info) return false
      uid = String(info.uid)
      room_id = info.room_id
    }

    // 若只提供了 uid，通过 API 补全 room_id
    if (uid && !room_id) {
      const info = await LiveBiliApi.getRoomInfobyUid(uid)
      if (!info || !info.room_id) return false
      room_id = info.room_id
    }

    if (!uid || !room_id) return false

    const raw = this.getRaw()
    const livedata = raw.data || {}
    uid = String(uid)
    group_id = String(group_id)

    if (!livedata[uid]) {
      livedata[uid] = { uid, room_id, group: {} }
    }
    if (!livedata[uid].group[group_id]) {
      livedata[uid].group[group_id] = []
    }
    if (!livedata[uid].group[group_id].includes(user_id)) {
      livedata[uid].group[group_id].push(user_id)
    }

    raw.data = livedata
    this._write(raw)
    return true
  }

  /**
   * 取消订阅
   * @param {{ uid: string, group_id: string|number, user_id: string|number }} data
   */
  remove(data) {
    const { uid, group_id, user_id } = data
    const raw = this.getRaw()
    const livedata = raw.data || {}
    const key = String(uid)
    const gid = String(group_id)

    const entry = livedata[key]
    if (!entry?.group?.[gid]) return

    entry.group[gid] = entry.group[gid].filter(id => id !== user_id)
    if (entry.group[gid].length === 0) {
      delete entry.group[gid]
    }
    if (Object.keys(entry.group).length === 0) {
      delete livedata[key]
    }

    raw.data = livedata
    this._write(raw)
  }

  /**
   * 列出订阅
   * @param {{ group_id?: string|number, user_id?: string|number }} filter
   * @returns {Array<{uid, room_id, users?: number[], groups?: string[]}>}
   */
  list({ group_id, user_id }) {
    const livedata = this.getRaw().data || {}
    const result = []

    for (const { uid, room_id, group } of Object.values(livedata)) {
      if (group_id && group[String(group_id)]) {
        result.push({ uid, room_id, users: group[String(group_id)] })
      }
      if (user_id) {
        const groups = []
        for (const [gid, users] of Object.entries(group)) {
          if (users.includes(user_id)) {
            groups.push(gid)
          }
        }
        if (groups.length > 0) {
          result.push({ uid, room_id, groups })
        }
      }
    }

    return result
  }

  /**
   * 获取所有订阅（keyed by uid）
   * @returns {object}
   */
  getAll() {
    return this.getRaw().data || {}
  }

  /**
   * 批量填充房间信息（昵称、头像、开播状态等）
   * @param {Array<{uid}>} items
   * @returns {Promise<Array>} 合并了 API 数据的 items，查询失败的条目被过滤
   */
  async enrichWithRoomInfo(items) {
    const uids = items.map(item => item.uid)
    const ret = await LiveBiliApi.getRoomInfobyUids(uids)
    if (!ret) return []
    return items
      .map(item => {
        const data = ret[item.uid]
        if (!data) return null
        return { ...item, ...data }
      })
      .filter(Boolean)
  }
}

export default new LiveSubStore()
