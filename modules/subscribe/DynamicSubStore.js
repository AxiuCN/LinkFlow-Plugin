import fs from 'node:fs'
import path from 'node:path'
import { subscribeDataDir } from '../../components/constants.js'

/** 动态订阅数据文件 */
const DATA_FILE = path.join(subscribeDataDir, 'dynamic_sub.json')

/**
 * 订阅数据结构:
 * {
 *   group: { 群号 -> [{ uid, name, types: [], bot_id }] },
 *   private: { QQ号 -> [{ uid, name, types: [], bot_id }] }
 * }
 * types 为空数组表示订阅所有类型
 * 支持的 types: DYNAMIC_TYPE_AV, DYNAMIC_TYPE_WORD, DYNAMIC_TYPE_DRAW,
 *               DYNAMIC_TYPE_ARTICLE, DYNAMIC_TYPE_FORWARD, DYNAMIC_TYPE_LIVE_RCMD
 */

class DynamicSubStore {
  getRaw() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      }
    } catch (e) {
      logger?.error('[LinkFlow] 读取数据失败:', e)
    }
    return { group: {}, private: {} }
  }

  _write(raw) {
    try {
      const dir = path.dirname(DATA_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(DATA_FILE, JSON.stringify(raw, null, '\t'), 'utf8')
    } catch (e) {
      logger?.error('[LinkFlow] 写入数据失败:', e)
    }
  }

  /**
   * 添加订阅
   * @param {{ uid: string, name: string, group_id?: string|number, user_id: string|number, bot_id: string, types?: string[] }} data
   * @returns {boolean}
   */
  add(data) {
    const { uid, name, group_id, user_id, bot_id, types } = data
    const sub = this.getRaw()
    const chatType = group_id ? 'group' : 'private'
    const chatId = String(group_id || user_id)

    if (!sub[chatType]) sub[chatType] = {}
    if (!sub[chatType][chatId]) sub[chatType][chatId] = []

    const list = sub[chatType][chatId]
    const existing = list.find(e => e.uid === uid && e.bot_id === bot_id)
    if (existing) {
      // 已有则合并 types
      if (types && types.length) {
        existing.types = [...new Set([...(existing.types || []), ...types])]
      }
    } else {
      list.push({ uid, name, types: types || [], bot_id })
    }

    this._write(sub)
    return true
  }

  /**
   * 移除订阅（全部或指定 types）
   * @param {{ uid: string, group_id?: string|number, user_id: string|number, bot_id: string, types?: string[] }} data
   * @returns {boolean} 是否找到并操作
   */
  remove(data) {
    const { uid, group_id, user_id, bot_id, types } = data
    const sub = this.getRaw()
    const chatType = group_id ? 'group' : 'private'
    const chatId = String(group_id || user_id)

    const chatData = sub[chatType]
    if (!chatData?.[chatId]) return false

    const list = chatData[chatId]
    const idx = list.findIndex(e => e.uid === uid && e.bot_id === bot_id)
    if (idx === -1) return false

    const entry = list[idx]
    if (types && types.length && entry.types?.length) {
      // 增量移除指定 types
      entry.types = entry.types.filter(t => !types.includes(t))
      if (entry.types.length > 0) {
        this._write(sub)
        return true
      }
    }

    // types 为空 或 所有 type 都移除了：删除整个条目
    list.splice(idx, 1)
    if (list.length === 0) delete chatData[chatId]
    if (Object.keys(chatData).length === 0) delete sub[chatType]

    this._write(sub)
    return true
  }

  /**
   * 列出订阅
   * @param {{ group_id?: string|number, user_id?: string|number }} filter
   * @returns {Array<{uid, name, types, bot_id}>}
   */
  list({ group_id, user_id }) {
    const sub = this.getRaw()
    if (group_id) {
      return sub.group?.[String(group_id)] || []
    }
    if (user_id) {
      return sub.private?.[String(user_id)] || []
    }
    return []
  }

  /**
   * 获取所有被订阅的 UID（去重）
   * @returns {Array<{uid: string, name: string}>}
   */
  getAllUniqueUIDs() {
    const sub = this.getRaw()
    const map = new Map()
    for (const chatType of ['group', 'private']) {
      for (const chatData of Object.values(sub[chatType] || {})) {
        for (const entry of chatData) {
          if (!map.has(entry.uid)) {
            map.set(entry.uid, { uid: entry.uid, name: entry.name })
          }
        }
      }
    }
    return [...map.values()]
  }

  /**
   * 获取所有群聊订阅（用于轮询后按群推送）
   * @returns {object} { uid -> { groups: { 群号 -> [bot_id, ...] }, privates: { QQ号 -> [bot_id, ...] } } }
   */
  getAllByUid() {
    const sub = this.getRaw()
    const map = {}
    for (const [chatId, list] of Object.entries(sub.group || {})) {
      for (const entry of list) {
        if (!map[entry.uid]) map[entry.uid] = { groups: {}, privates: {} }
        if (!map[entry.uid].groups[chatId]) map[entry.uid].groups[chatId] = []
        map[entry.uid].groups[chatId].push(entry.bot_id)
      }
    }
    for (const [chatId, list] of Object.entries(sub.private || {})) {
      for (const entry of list) {
        if (!map[entry.uid]) map[entry.uid] = { groups: {}, privates: {} }
        if (!map[entry.uid].privates[chatId]) map[entry.uid].privates[chatId] = []
        map[entry.uid].privates[chatId].push(entry.bot_id)
      }
    }
    return map
  }
}

export default new DynamicSubStore()
