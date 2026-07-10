import fs from 'node:fs'
import path from 'node:path'
import { pluginData } from '../../components/constants.js'

/** 订阅数据文件路径 */
const DATA_FILE = path.join(pluginData, 'subscribe', 'dynamic_bili.json')
const CURRENT_VERSION = 1

/**
 * 动态订阅数据管理
 * 数据结构: { version, data: { uid → { uid, name, face, group: { 群号 → [{user_id, types}] } } } }
 *
 * user_id 语义: 0 = @全体, 99999 = 匿名
 * types: 空数组 = 全部类型, 非空 = 仅推送指定类型（中文关键词）
 */
class DynamicSubStore {
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
      logger?.error('[LinkFlow] 读取动态订阅数据失败:', e)
    }
    return { version: CURRENT_VERSION, data: {} }
  }

  /**
   * 写入完整订阅数据
   */
  _write(raw) {
    try {
      const dir = path.dirname(DATA_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(DATA_FILE, JSON.stringify(raw, null, '\t'), 'utf8')
    } catch (e) {
      logger?.error('[LinkFlow] 写入动态订阅数据失败:', e)
    }
  }

  /**
   * 添加订阅
   * @param {{ uid: string, name?: string, face?: string, group_id: string|number, user_id: string|number, types?: string[] }} data
   */
  add(data) {
    const { uid, name, face, group_id, user_id, types } = data
    if (!uid || group_id === undefined) return false

    const raw = this.getRaw()
    const dynData = raw.data || {}
    const key = String(uid)
    const gid = String(group_id)

    if (!dynData[key]) {
      dynData[key] = { uid: key, name: name || '', face: face || '', group: {} }
    } else {
      // 更新昵称和头像
      if (name) dynData[key].name = name
      if (face) dynData[key].face = face
    }

    if (!dynData[key].group[gid]) {
      dynData[key].group[gid] = []
    }

    // 检查是否已存在（同一用户+同一uid），存在则更新 types
    const existing = dynData[key].group[gid].find(s => s.user_id === user_id)
    if (existing) {
      existing.types = types || []
    } else {
      dynData[key].group[gid].push({ user_id, types: types || [] })
    }

    raw.data = dynData
    this._write(raw)
    return true
  }

  /**
   * 取消订阅
   * @param {{ uid: string, group_id: string|number, user_id: string|number }} data
   */
  remove(data) {
    const { uid, group_id, user_id } = data
    if (!uid) return

    const raw = this.getRaw()
    const dynData = raw.data || {}
    const key = String(uid)
    const gid = String(group_id)

    const entry = dynData[key]
    if (!entry?.group?.[gid]) return

    entry.group[gid] = entry.group[gid].filter(s => s.user_id !== user_id)
    if (entry.group[gid].length === 0) {
      delete entry.group[gid]
    }
    if (Object.keys(entry.group).length === 0) {
      delete dynData[key]
    }

    raw.data = dynData
    this._write(raw)
  }

  /**
   * 列出订阅
   * @param {{ group_id?: string|number, user_id?: string|number }} filter
   * @returns {Array<{uid, name, face, users?: number[], groups?: string[], types?: string[]}>}
   */
  list({ group_id, user_id } = {}) {
    const dynData = this.getRaw().data || {}
    const result = []

    for (const entry of Object.values(dynData)) {
      const { uid, name, face, group } = entry

      if (group_id && group[String(group_id)]) {
        // 取第一个匹配订阅者的 types（展示用）
        const subscribers = group[String(group_id)]
        result.push({ uid, name, face, users: subscribers })
      }

      if (user_id) {
        const groups = []
        let subscriberTypes = []
        for (const [gid, subscribers] of Object.entries(group)) {
          const sub = subscribers.find(s => s.user_id === user_id)
          if (sub) {
            groups.push(gid)
            subscriberTypes = sub.types || []
          }
        }
        if (groups.length > 0) {
          result.push({ uid, name, face, groups, types: subscriberTypes })
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
   * 获取去重后的 UID 列表
   * @returns {string[]}
   */
  getUniqueUids() {
    return Object.keys(this.getAll())
  }

  /**
   * 获取指定 UID 的所有订阅者（可指定群过滤，用于知道是群订阅）
   * 返回: [{ group_id, user_id, types }]
   */
  getSubscribersForUid(uid) {
    const entry = this.getAll()[String(uid)]
    if (!entry?.group) return []
    const result = []
    for (const [gid, subscribers] of Object.entries(entry.group)) {
      for (const s of subscribers) {
        result.push({ group_id: gid, user_id: s.user_id, types: s.types })
      }
    }
    return result
  }

  /**
   * 更新 UP 昵称和头像（API 查询后回写）
   * @param {string} uid
   * @param {{ name?: string, face?: string }} info
   */
  updateInfo(uid, info) {
    const raw = this.getRaw()
    const entry = raw.data?.[String(uid)]
    if (!entry) return
    if (info.name) entry.name = info.name
    if (info.face) entry.face = info.face
    this._write(raw)
  }
}

export default new DynamicSubStore()
