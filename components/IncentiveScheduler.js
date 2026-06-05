import { loadUserConfig, saveUserConfig, listUserConfigs } from '../components/IncentiveConfig.js'
import { loadAccountCookies } from '../components/Storage.js'
import { doClaim } from '../components/Claimer.js'
import { getPluginConfig } from '../components/config.js'
import { logTask, logClaim } from '../components/Logger.js'

/** 默认截止时间（秒），可从配置覆盖 */
const DEFAULT_DEADLINE = 40

/** B站 API 错误码：任务奖励已经领取 */
const CODE_ALREADY_CLAIMED = 'code=202031'

/** 判定"已领取"——仅通过精确的错误码 202031 判断 */
function isAlreadyClaimed(errMsg) {
  if (!errMsg) return false
  return errMsg.includes(CODE_ALREADY_CLAIMED)
}

/**
 * cron 触发时被调用
 * 检查全局开关，遍历所有有 Cookie 的用户进行领取
 * 全部任务必须在 claimDeadline 秒内完成（0=不限）
 */
async function onCronTick() {
  const config = getPluginConfig()
  if (!config?.incentive?.enabled) {
    logger.info('[Bilibili-Plugin] 激励领取已关闭，跳过')
    return
  }

  const claimTime = config?.incentive?.claimTime || '01:00'
  const deadline = config?.incentive?.claimDeadline ?? DEFAULT_DEADLINE
  const allQq = listUserConfigs()
  if (!allQq.length) {
    logger.info('[Bilibili-Plugin] 无配置用户，跳过')
    return
  }

  logger.info(`[Bilibili-Plugin] 每日激励领取开始 (${claimTime})，共 ${allQq.length} 个配置用户` +
    (deadline > 0 ? `，截止 ${deadline}s` : '，不限时'))

  // 全局取消信号
  const cancelSignal = { cancelled: false }
  let deadlineTimer
  if (deadline > 0) {
    deadlineTimer = setTimeout(() => {
      cancelSignal.cancelled = true
      logger.info(`[Bilibili-Plugin] 全局截止时间到（${deadline}s），取消剩余任务`)
    }, deadline * 1000)
  }

  const promises = []
  for (const qq of allQq) {
    const cookies = loadAccountCookies(qq)
    if (!cookies) continue

    const cfg = loadUserConfig(qq)
    if (!cfg) continue

    const links = (cfg.links || []).filter(l => l && typeof l === 'string')
    if (!links.length) continue

    logTask(`开始执行领取流程，共 ${links.length} 个链接`, qq)

    promises.push(
      startClaimRound(qq, links, cfg.notifyGroup || 0, cancelSignal).catch(err => {
        logger.error(`[Bilibili-Plugin] QQ ${qq} 领取异常:`, err)
      }),
    )
  }

  await Promise.allSettled(promises)
  clearTimeout(deadlineTimer)
  logger.info('[Bilibili-Plugin] 本轮领取全部结束')
}

/**
 * 对单个用户的所有链接执行领取
 * @param {string|number} qq
 * @param {string[]} links
 * @param {number} notifyGroup
 * @param {{cancelled: boolean}} cancelSignal - 全局取消信号
 */
async function startClaimRound(qq, links, notifyGroup, cancelSignal) {
  const results = []
  const slotsToClear = new Set()
  let cfg = loadUserConfig(qq)

  for (const url of links) {
    // 全局截止时间到，跳过剩余槽位
    if (cancelSignal.cancelled) {
      results.push({ url, success: false, error: '达到全局截止时间' })
      continue
    }

    let taskId = null
    try { taskId = new URL(url).searchParams.get('task_id') } catch {}
    if (!taskId) {
      const m = (url || '').match(/task_id=([^&\s]+)/)
      if (m) taskId = m[1]
    }
    if (!taskId) {
      results.push({ url, success: false, error: '无法解析 task_id' })
      continue
    }

    logTask(`当前任务 ID: ${taskId}`, qq)

    try {
      const { cdkey, awardInfo } = await doClaim(taskId, qq, cancelSignal)
      results.push({ url, success: true, awardName: awardInfo.award_name, cdkey })
      logClaim(`成功: code=0, cdkey=${cdkey}`, qq)
      logger.info(`[Bilibili-Plugin] QQ ${qq} task ${taskId} 领取成功: ${awardInfo.award_name} ${cdkey}`)
    } catch (err) {
      const isDeadline = cancelSignal.cancelled
      const errMsg = isDeadline ? '达到全局截止时间' : err.message
      results.push({ url, success: false, error: errMsg })
      logClaim(`失败: ${errMsg}`, qq)
      logger.warn(`[Bilibili-Plugin] QQ ${qq} task ${taskId} 领取失败: ${errMsg}`)

      // 截止时间到，不再处理后续链接
      if (isDeadline) break

      // 标记已领取的链接待清空
      if (isAlreadyClaimed(err.message) && cfg) {
        const idx = (cfg.links || []).findIndex(l => l === url)
        if (idx !== -1) slotsToClear.add(idx)
      }
    }
  }

  // 自动删除已领取的链接
  if (slotsToClear.size > 0 && cfg) {
    const updated = [...(cfg.links || [])]
    const clearedSlots = []
    for (const idx of slotsToClear) {
      if (updated[idx]) {
        updated[idx] = ''
        clearedSlots.push(idx + 1)
      }
    }
    cfg.links = updated
    saveUserConfig(qq, cfg)
    logTask(`已自动清空 ${clearedSlots.length} 个已领取槽位: ${clearedSlots.join(',')}`, qq)
    logger.info(`[Bilibili-Plugin] QQ ${qq} 已自动清空 ${slotsToClear.size} 个已领取槽位`)
  }

  // 发送通知
  sendNotify(qq, results, notifyGroup, slotsToClear.size)
}

/**
 * 构建通知消息
 */
function buildNotifyLines(qq, results, clearedCount) {
  const lines = ['[b站插件] 每日激励领取结果']
  for (const r of results) {
    if (r.success) {
      lines.push(`✓ ${r.awardName || '兑换成功'}: ${r.cdkey}`)
    } else {
      const flag = r.error && isAlreadyClaimed(r.error) ? '(已领取，已自动删除)' : ''
      lines.push(`✗ ${r.error || '失败'}${flag}`)
    }
  }
  const success = results.filter(r => r.success).length
  const fail = results.length - success
  lines.push(`用户 ${qq} | 共 ${results.length} 个: ${success} 成功, ${fail} 失败`)
  if (clearedCount > 0) lines.push(`自动清理: ${clearedCount} 个已领取链接`)
  return lines
}

/**
 * 发送通知（私聊用户 + 群通知）
 */
async function sendNotify(qq, results, notifyGroup, clearedCount = 0) {
  const lines = buildNotifyLines(qq, results, clearedCount)
  const msg = lines.join('\n')

  try {
    await Bot.pickUser(Number(qq)).sendMsg(msg)
  } catch (e) {
    logger.debug(`[Bilibili-Plugin] 发送私聊通知到用户 ${qq} 失败（可能不是好友）:`, e)
  }

  if (notifyGroup) {
    try {
      await Bot.pickGroup(Number(notifyGroup)).sendMsg(msg)
    } catch (e) {
      logger.error(`[Bilibili-Plugin] 发送通知到群 ${notifyGroup} 失败:`, e)
    }
  }
}

export { onCronTick }
