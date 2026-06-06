import { loadUserConfig, saveUserConfig, listUserConfigs, MAX_SLOTS } from '../components/IncentiveConfig.js'
import { loadAccountCookies } from '../components/Storage.js'
import { doClaim } from '../components/Claimer.js'
import { getPluginConfig } from '../components/config.js'
import { logTask, logClaim } from '../components/Logger.js'
import { setTaskInfo } from '../components/TaskCache.js'
import { render } from '../components/render.js'
import { pluginVersion, yunzaiVersion } from '../components/pluginVersion.js'

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
 * 从 API 错误字符串中提取 code 和 msg
 * 兼容格式：code=202031 msg=xxx、code=-509 message=xxx、终态: code=202031 msg=xxx、领取失败: ...
 * 匹配不到时整句作为 msg
 * @param {string} errMsg
 * @returns {{ code: string, msg: string }}
 */
function parseErrorCode(errMsg) {
  if (!errMsg) return { code: '?', msg: '未知错误' }
  const codeMatch = errMsg.match(/code=(-?\d+)/)
  const msgMatch = errMsg.match(/(?:msg|message)=([^;,]+)/)
  return {
    code: codeMatch ? codeMatch[1] : '?',
    msg: msgMatch ? msgMatch[1].trim() : errMsg,
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * cron 触发时被调用
 * 检查全局开关，遍历所有有 Cookie 的用户进行领取
 * 全部任务必须在 claimDeadline 秒内完成（0=不限）
 * 领取完毕后发送群通知 HTML 和个人通知 HTML（间隔10s）
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
      startClaimRound(qq, cfg, cancelSignal).catch(err => {
        logger.error(`[Bilibili-Plugin] QQ ${qq} 领取异常:`, err)
        return null
      }),
    )
  }

  const settled = await Promise.allSettled(promises)
  clearTimeout(deadlineTimer)
  logger.info('[Bilibili-Plugin] 本轮领取全部结束')

  const userResults = settled
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  if (!userResults.length) return

  // Phase 1: 群通知（每群一张 HTML 图）
  const hasGroupNotify = await sendGroupNotifies(userResults)

  // Phase 2: 个人通知（群通知完成后 10s，间隔 10s）
  if (hasGroupNotify) await sleep(10000)
  await sendPersonalNotifies(userResults)
}

/**
 * 对单个用户的所有槽位执行领取
 * @param {string|number} qq
 * @param {object} cfg          — 完整个人配置（含 links[13]）
 * @param {{cancelled: boolean}} cancelSignal
 * @returns {Promise<{qq, notifyGroup: number, slots: object[], clearedCount: number}>}
 */
async function startClaimRound(qq, cfg, cancelSignal) {
  const allLinks = Array.isArray(cfg.links) ? cfg.links : Array(MAX_SLOTS).fill('')
  const notifyGroup = cfg.notifyGroup || 0
  const slots = []
  const slotsToClear = new Set()

  const logCb = (msg) => logClaim(msg, qq)

  for (let slotIdx = 0; slotIdx < MAX_SLOTS; slotIdx++) {
    const url = (allLinks[slotIdx] || '').trim()
    if (!url) {
      slots.push({ index: slotIdx + 1, status: 'empty' })
      continue
    }

    // 提取 taskId
    let taskId = null
    try { taskId = new URL(url).searchParams.get('task_id') } catch {}
    if (!taskId) {
      const m = url.match(/task_id=([^&\s]+)/)
      if (m) taskId = m[1]
    }

    // 截止时间到：剩余非空槽全部标记 skipped
    if (cancelSignal.cancelled) {
      fillRemainingSlots(slots, allLinks, slotIdx)
      break
    }

    if (!taskId) {
      slots.push({ index: slotIdx + 1, status: 'failed', errorCode: '?', errorMsg: '无法解析 task_id' })
      continue
    }

    logTask(`当前任务 ID: ${taskId}`, qq)

    try {
      const { cdkey, awardInfo } = await doClaim(taskId, qq, cancelSignal, logCb)
      slots.push({
        index: slotIdx + 1,
        status: 'success',
        taskId,
        act_name: awardInfo.act_name || '',
        task_name: awardInfo.task_name || '',
        task_desc: awardInfo.task_desc || '',
        award_name: awardInfo.award_name || '',
        cdkey: cdkey || '',
      })
      logClaim(`已领取: code=0, cdkey=${cdkey}`, qq)
      setTaskInfo(taskId, awardInfo)
      logger.info(`[Bilibili-Plugin] QQ ${qq} task ${taskId} 已领取: ${awardInfo.award_name} ${cdkey}`)
      slotsToClear.add(slotIdx)
    } catch (err) {
      const isDeadline = cancelSignal.cancelled
      const errMsg = isDeadline ? '达到全局截止时间' : err.message
      const { code, msg } = parseErrorCode(errMsg)

      // 先检查是否已领取——即使截止时间到，已领取仍需标记清空
      if (isAlreadyClaimed(err.message)) {
        slotsToClear.add(slotIdx)
      }

      // 截止触发在此任务执行期间：标记当前及后续为 skipped
      if (isDeadline) {
        fillRemainingSlots(slots, allLinks, slotIdx)
        break
      }

      slots.push({
        index: slotIdx + 1,
        status: 'failed',
        taskId,
        errorCode: code,
        errorMsg: msg,
      })
      logClaim(`失败: ${errMsg}`, qq)
      logger.warn(`[Bilibili-Plugin] QQ ${qq} task ${taskId} 领取失败: ${errMsg}`)
    }
  }

  // 自动删除已领取的链接
  if (slotsToClear.size > 0) {
    const updated = [...allLinks]
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

  return { qq, notifyGroup, slots, clearedCount: slotsToClear.size }
}

/**
 * 补充剩余槽位——截止时间到时，非空填 skipped，空填 empty
 * @param {object[]} slots   — 收集结果的数组
 * @param {string[]} allLinks
 * @param {number} fromIdx   — 起始槽位索引
 */
function fillRemainingSlots(slots, allLinks, fromIdx) {
  for (let j = fromIdx; j < MAX_SLOTS; j++) {
    const u = (allLinks[j] || '').trim()
    if (u) {
      slots.push({ index: j + 1, status: 'skipped' })
    } else {
      slots.push({ index: j + 1, status: 'empty' })
    }
  }
}

// ===================== 群通知 =====================

/**
 * 发送群通知 HTML 图片
 * 按 notifyGroup 分组，每群渲染一张图
 * @param {Array<{qq, notifyGroup, slots}>} userResults
 * @returns {Promise<boolean>} 是否有群通知发出
 */
async function sendGroupNotifies(userResults) {
  // 按 notifyGroup 分组
  const groupMap = new Map()
  for (const ur of userResults) {
    const gid = ur.notifyGroup
    if (!gid) continue
    if (!groupMap.has(gid)) groupMap.set(gid, [])
    groupMap.get(gid).push(ur)
  }
  if (!groupMap.size) return false

  const date = todayStr()

  for (const [gid, members] of groupMap) {
    const groupData = buildGroupNotifyData(gid, members, date)
    if (!groupData) continue

    let img
    try {
      img = await render('incentive/group', 'index', groupData, 'png')
    } catch (e) {
      logger.error(`[Bilibili-Plugin] 渲染群 ${gid} 通知 HTML 失败:`, e)
      // 降级：发送文本摘要
      const textFallback = buildGroupTextFallback(gid, members)
      try {
        await Bot.pickGroup(Number(gid)).sendMsg(textFallback)
      } catch (e2) {
        logger.error(`[Bilibili-Plugin] 发送群 ${gid} 文本通知失败:`, e2)
      }
      continue
    }

    try {
      await Bot.pickGroup(Number(gid)).sendMsg(img)
    } catch (e) {
      logger.error(`[Bilibili-Plugin] 发送群 ${gid} 通知图片失败:`, e)
    }
  }

  return true
}

/**
 * 构建群通知 HTML 模板数据
 * @param {string|number} gid
 * @param {Array<{qq, slots}>} members
 * @param {string} date
 * @returns {object|null}
 */
function buildGroupNotifyData(gid, members, date) {
  const memberList = []
  let totalSuccess = 0
  let totalFail = 0

  for (const m of members) {
    // 群通知只展示成功/失败，不含截止未开始和空槽
    const activeSlots = m.slots.filter(s => s.status === 'success' || s.status === 'failed')
    if (!activeSlots.length) {
      // 无成功/失败的任务，不在群通知中显示该用户
      continue
    }

    const displaySlots = activeSlots.map(s => ({
      act_name: s.act_name || '',
      task_name: s.task_name || '',
      task_desc: s.task_desc || '',
      award_name: s.award_name || '',
      status: s.status,  // 'success' | 'failed'
    }))

    for (const s of activeSlots) {
      if (s.status === 'success') totalSuccess++
      else totalFail++
    }

    memberList.push({ qq: m.qq, hasTasks: true, slots: displaySlots })
  }

  if (!memberList.length) return null

  return {
    version: pluginVersion,
    yunzaiVersion,
    date,
    groupId: gid,
    totalUsers: memberList.length,
    successCount: totalSuccess,
    failCount: totalFail,
    members: memberList,
  }
}

/**
 * 群通知渲染失败时的文本降级
 */
function buildGroupTextFallback(gid, members) {
  const lines = [`[b站插件] 群 ${gid} 激励领取结果`]
  for (const m of members) {
    // 只统计成功/失败，不含未开始
    const activeSlots = m.slots.filter(s => s.status === 'success' || s.status === 'failed')
    if (!activeSlots.length) continue
    const success = activeSlots.filter(s => s.status === 'success').length
    const fail = activeSlots.filter(s => s.status === 'failed').length
    const parts = []
    if (success) parts.push(`${success}成功`)
    if (fail) parts.push(`${fail}失败`)
    lines.push(`QQ ${m.qq}: ${parts.join(', ')}`)
  }
  return lines.join('\n')
}

// ===================== 个人通知 =====================

/**
 * 发送个人通知 HTML 图片
 * 逐用户渲染，间隔 10s
 * @param {Array<{qq, notifyGroup, slots, clearedCount}>} userResults
 */
async function sendPersonalNotifies(userResults) {
  const date = todayStr()

  for (let i = 0; i < userResults.length; i++) {
    if (i > 0) await sleep(10000)

    const ur = userResults[i]
    const userData = buildPersonalNotifyData(ur, date)
    if (!userData) continue

    let img
    try {
      img = await render('incentive/user', 'index', userData, 'png')
    } catch (e) {
      logger.error(`[Bilibili-Plugin] 渲染用户 ${ur.qq} 通知 HTML 失败:`, e)
      const textFallback = buildPersonalTextFallback(ur)
      try {
        await Bot.pickUser(Number(ur.qq)).sendMsg(textFallback)
      } catch (e2) {
        logger.debug(`[Bilibili-Plugin] 发送用户 ${ur.qq} 文本通知失败:`, e2)
      }
      continue
    }

    try {
      await Bot.pickUser(Number(ur.qq)).sendMsg(img)
    } catch (e) {
      logger.debug(`[Bilibili-Plugin] 发送用户 ${ur.qq} 通知图片失败（可能不是好友）:`, e)
    }
  }
}

/**
 * 构建个人通知 HTML 模板数据
 * @param {{qq, slots, clearedCount}} userResult
 * @param {string} date
 * @returns {object|null}
 */
function buildPersonalNotifyData(userResult, date) {
  // 非空槽（含已经领取后清空的）保留展示
  const activeSlots = userResult.slots.filter(s => s.status !== 'empty')

  if (!activeSlots.length) {
    // 全部为空：展示"暂无任务"
    return {
      version: pluginVersion,
      yunzaiVersion,
      date,
      qq: userResult.qq,
      hasTasks: false,
      slots: [],
    }
  }

  const slotList = activeSlots.map(s => ({
    index: s.index,
    act_name: s.act_name || '',
    task_name: s.task_name || '',
    task_desc: s.task_desc || '',
    award_name: s.award_name || '',
    status: s.status === 'success' ? 'claimed' : s.status,  // 模板中识别 'claimed'
    cdkey: s.cdkey || '',
  }))

  return {
    version: pluginVersion,
    yunzaiVersion,
    date,
    qq: userResult.qq,
    hasTasks: true,
    slots: slotList,
  }
}

/**
 * 个人通知渲染失败时的文本降级
 */
function buildPersonalTextFallback(ur) {
  const lines = [`[b站插件] 每日激励领取结果`]
  const activeSlots = ur.slots.filter(s => s.status !== 'empty')

  if (!activeSlots.length) {
    lines.push('暂无任务')
    return lines.join('\n')
  }

  for (const s of activeSlots) {
    const prefix = `槽位${s.index}: `
    if (s.status === 'success') {
      lines.push(`${prefix}领取成功${s.cdkey ? ` cdkey=${s.cdkey}` : ''}`)
    } else if (s.status === 'failed') {
      lines.push(`${prefix}未成功 code=${s.errorCode}`)
    } else if (s.status === 'skipped') {
      lines.push(`${prefix}未开始`)
    }
  }

  if (ur.clearedCount > 0) {
    lines.push(`已自动清空 ${ur.clearedCount} 个已领取链接`)
  }

  return lines.join('\n')
}

/** 获取当前日期字符串 */
function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export { onCronTick }
