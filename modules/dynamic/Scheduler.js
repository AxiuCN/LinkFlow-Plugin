/**
 * 动态订阅调度器
 *
 * 职责：
 * - cron 轮询入口
 * - 遍历所有订阅 UID → 拉取动态列表 → 过滤 → 去重 → 渲染 → 推送
 */

import { BiliClient } from '../../model/BiliClient.js'
import { getPluginConfig } from '../../components/config.js'
import { render } from '../../components/render.js'
import { pluginVersion, yunzaiVersion } from '../../components/pluginVersion.js'
import DynamicSubStore from './SubStore.js'
import { formatDynamicItem, typeMatches, typeToLabel } from './Query.js'
import {
  REDIS_PREFIX_DYNAMIC_GROUP,
  REDIS_PREFIX_DYNAMIC_PRIVATE,
  DYNAMIC_DEFAULT_TIME_RANGE,
  DYNAMIC_DEFAULT_UP_FETCH_DELAY,
} from '../../components/constants.js'

/** 去重 TTL：72 小时 */
const DEDUP_TTL = 72 * 3600

/**
 * 随机延迟（2-8 秒），避免并发请求触发风控
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function randomDelay(max = DYNAMIC_DEFAULT_UP_FETCH_DELAY) {
  return sleep(2000 + Math.floor(Math.random() * Math.max(0, max - 2000)))
}

/**
 * 动态调度器
 */
class DynamicScheduler {
  /**
   * cron 入口
   */
  async poll() {
    const config = getPluginConfig()
    const dynCfg = config.subscribe?.dynamic || {}
    if (!dynCfg.enabled) {
      logger?.info('[LinkFlow] 动态订阅已关闭，跳过')
      return
    }

    // 获取 bot Cookie
    let client
    try {
      client = new BiliClient(null, dynCfg.timeout || 15, true)
    } catch (e) {
      logger?.warn('[LinkFlow] 动态调度：Bot B站 未登录，跳过本轮')
      return
    }

    const allData = DynamicSubStore.getAll()
    const uids = Object.keys(allData)
    if (!uids.length) return

    const timeRange = dynCfg.timeRange ?? DYNAMIC_DEFAULT_TIME_RANGE
    const sleepMs = (dynCfg.sleep || 0) * 1000
    const useForward = dynCfg.forward || false

    logger?.info(`[LinkFlow] 动态轮询开始: ${uids.length} 个 UP，时间窗口 ${timeRange}s`)

    const now = Math.floor(Date.now() / 1000)

    for (const uid of uids) {
      try {
        const res = await client.getDynamicList(uid)
        const items = res?.data?.items || []

        if (!items.length) {
          await randomDelay()
          continue
        }

        // 回写 UP 信息
        const firstItem = items[0]
        const author = firstItem.modules?.module_author
        if (author) {
          DynamicSubStore.updateInfo(uid, {
            name: author.name || '',
            face: author.face || '',
          })
        }

        // 获取该 uid 的所有订阅者（用于类型过滤）
        const subscribers = DynamicSubStore.getSubscribersForUid(uid)
        if (!subscribers.length) {
          await randomDelay()
          continue
        }

        // 遍历每条动态
        for (const item of items) {
          const formatted = formatDynamicItem(item)
          if (!formatted) continue

          const pubTs = item.modules?.module_author?.pub_ts || item.pub_ts || 0

          // 时间窗口过滤
          if (timeRange > 0 && (now - pubTs) > timeRange) continue

          // 对每个订阅群/用户推送
          for (const sub of subscribers) {
            const { group_id, user_id, types } = sub

            // 类型过滤
            if (types && types.length > 0 && !typeMatches(formatted.type, types)) continue

            // 确定 chatId（群聊用 group_id，私聊 user_id 暂不单独处理）
            const chatId = group_id

            // 去重
            const dedupKey = `${REDIS_PREFIX_DYNAMIC_GROUP}:${chatId}:${formatted.dynamicId}`
            const alreadySent = await redis.get(dedupKey)
            if (alreadySent) continue

            // 构建模板数据
            const entry = allData[uid]
            const templateData = {
              version: pluginVersion,
              yunzaiVersion,
              upName: entry?.name || '',
              upFace: entry?.face || '',
              upUid: uid,
              typeLabel: formatted.typeLabel,
              time: formatted.time,
              title: formatted.title,
              content: formatted.content,
              pics: formatted.pics || [],
              cover: formatted.cover,
              jumpUrl: formatted.jumpUrl,
              hasForward: formatted.hasForward,
              forward: formatted.forward,
            }

            // 渲染推送
            try {
              const img = await render('dynamic', 'card', templateData, 'png')

              // @全体 / 匿名处理
              const mentions = []
              if (user_id === 0) {
                mentions.push(segment.at('all'))
              } else if (user_id !== 99999) {
                mentions.push(segment.at(user_id))
              }

              if (useForward) {
                // TODO: 合并转发模式
                await Bot.pickGroup(Number(group_id)).sendMsg([...mentions, img].filter(Boolean))
              } else {
                await Bot.pickGroup(Number(group_id)).sendMsg([...mentions, '\n', img].filter(Boolean))
              }

              // 设置去重标记（NX 原子写入）
              await redis.set(dedupKey, '1', { NX: true, EX: DEDUP_TTL })
              logger?.info(`[LinkFlow] 动态推送: uid=${uid} type=${formatted.type} → 群${chatId}`)
            } catch (e) {
              logger?.error(`[LinkFlow] 动态推送失败 uid=${uid} group=${chatId}:`, e)
            }

            // 群间间隔
            if (sleepMs > 0) await sleep(sleepMs)
          }
        }
      } catch (e) {
        logger?.error(`[LinkFlow] 拉取 uid=${uid} 动态失败:`, e)
      }

      // UP 之间间隔
      await randomDelay()
    }

    logger?.info('[LinkFlow] 动态轮询结束')
  }
}

export default new DynamicScheduler()
