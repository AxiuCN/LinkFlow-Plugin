import fs from 'node:fs'
import path from 'node:path'
import { fetchDynamicFeed } from '../../model/bilibili/dynamic.js'
import { getPluginConfig } from '../../components/config.js'
import DynamicSubStore from './DynamicSubStore.js'
import { render } from '../../components/render.js'
import { pluginVersion, yunzaiVersion } from '../../components/pluginVersion.js'
import { sleep } from '../../components/utils.js'
import { subscribeDataDir } from '../../components/constants.js'

/** 动态订阅去重文件（按 id_str 持久化，重启不丢） */
const DEDUP_FILE = path.join(subscribeDataDir, 'dynamic_dedup.json')

class DynamicScheduler {
  /**
   * cron 入口：轮询所有已订阅 UP 主的动态
   * @param {string} [botId] - 当前机器人 QQ
   */
  async poll(botId) {
    const cfg = getPluginConfig()
    if (!cfg?.subscribe?.dynamic?.enabled) return

    const uids = DynamicSubStore.getAllUniqueUIDs()
    if (!uids.length) return

    const timeRange = cfg?.subscribe?.dynamic?.timeRange || 7200
    const now = Date.now() / 1000

    logger?.info(`[LinkFlow] 开始轮询 ${uids.length} 个UP`)

    for (const { uid, name } of uids) {
      try {
        const feed = await fetchDynamicFeed(uid)
        if (!feed?.items?.length) continue

        const fresh = feed.items.filter(item => {
          const pubTs = item.pubTs || 0
          return pubTs > 0 && (now - pubTs) <= timeRange
        })
        if (!fresh.length) continue

        const dedup = loadDedup()
        const newItems = fresh.filter(item => !dedup[item.id_str])

        const uidMap = DynamicSubStore.getAllByUid()
        const uidCfg = uidMap[uid]
        if (!uidCfg) continue

        for (const item of newItems) {
          await this._pushToGroups(item, uidCfg.groups, botId)
          await this._pushToPrivates(item, uidCfg.privates, botId)
          dedup[item.id_str] = now
        }

        saveDedup(dedup)
        await sleep(2000 + Math.random() * 3000)
      } catch (e) {
        logger?.error(`[LinkFlow] poll uid=${uid} 异常:`, e)
      }
    }

    logger?.info('[LinkFlow] 轮询完成')
  }

  async _pushToGroups(item, groups, botId) {
    if (!groups) return
    for (const [gid, botIds] of Object.entries(groups)) {
      if (botIds && !botIds.includes(botId)) continue
      await this._sendDynamicCard(item, 'group', gid)
    }
  }

  async _pushToPrivates(item, privates, botId) {
    if (!privates) return
    for (const [qq, botIds] of Object.entries(privates)) {
      if (botIds && !botIds.includes(botId)) continue
      await this._sendDynamicCard(item, 'private', qq)
    }
  }

  async _sendDynamicCard(item, chatType, chatId) {
    try {
      const img = await render('subscribe/dynamic', 'index', {
        ...item,
        version: pluginVersion,
        yunzaiVersion,
      }, 'png')

      if (chatType === 'group') {
        await Bot.pickGroup(Number(chatId)).sendMsg(img)
      } else {
        await Bot.pickFriend(Number(chatId)).sendMsg(img)
      }
    } catch (e) {
      logger?.error(`[LinkFlow] 发送卡片 ${chatType}/${chatId} 失败:`, e)
    }
  }
}

function loadDedup() {
  try {
    if (fs.existsSync(DEDUP_FILE)) {
      return JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf8'))
    }
  } catch {}
  return {}
}

function saveDedup(data) {
  try {
    const dir = path.dirname(DEDUP_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const cutoff = Date.now() / 1000 - 7 * 86400
    const cleaned = {}
    for (const [k, v] of Object.entries(data)) {
      if (v > cutoff) cleaned[k] = v
    }
    fs.writeFileSync(DEDUP_FILE, JSON.stringify(cleaned, null, 2), 'utf8')
  } catch {}
}

export default new DynamicScheduler()
