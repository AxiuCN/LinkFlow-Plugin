import { loadUserConfig, saveUserConfig, listUserConfigs, MAX_SLOTS } from '../components/IncentiveConfig.js'
import { loadAccountCookies } from '../components/Storage.js'
import { doClaim, createClient } from '../components/Claimer.js'
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
 * 从 API 错误字符串中提取最后一个 code 和 msg
 * 多 worker 重试时 errLog 包含多次尝试，取最后一个反映最终结果
 * 兼容格式：code=202031 msg=xxx、code=-509 message=xxx、终态: code=202031 msg=xxx、领取失败: ...
 * 匹配不到时整句作为 msg
 * @param {string} errMsg
 * @returns {{ code: string, msg: string }}
 */
function parseErrorCode(errMsg) {
  if (!errMsg) return { code: '?', msg: '未知错误' }
  const codes = errMsg.match(/code=(-?\d+)/g)
  const msgs = errMsg.match(/(?:msg|message)=([^;,]+)/g)
  return {
    code: codes ? codes[codes.length - 1].replace('code=', '') : '?',
    msg: msgs ? msgs[msgs.length - 1].replace(/^(?:msg|message)=/i, '').trim() : errMsg,
  }
}

/**
 * 状态→HTML 显示文本映射
 * 所有状态均在此定义，template 通过 displayText 字段引用，不再硬编码 if/else
 */
const STATUS_DISPLAY_MAP = {
  success: '领取成功',
  already_claimed: '已领取',
  unclaimed: '未领取',
  incomplete: '未完成',
  exhausted: '库存耗尽',
  suspicious: '账号行为异常',
  skipped: '未开始',
  empty: '暂无任务',
  no_qualification: '无领取资格',
  logged_out: '未登录',
  not_yet_time: '未到领取时间',
  config_error: '配置错误',
  api_error: 'API客户端创建错误',
  failed: '领取失败',
}

/**
 * 根据 API 错误码和消息归类失败原因
 * @param {string} code
 * @param {string} msg
 * @returns {string} — STATUS_DISPLAY_MAP 中的 key
 */
function categorizeError(code, msg) {
  // 精确 code 匹配
  if (code === '202031') return 'already_claimed'
  if (code === '202032') return 'no_qualification'
  if (code === '75255') return 'exhausted'
  if (code === '202101') return 'suspicious'
  if (code === '-101') return 'logged_out'
  if (code === '202120') return 'not_yet_time'
  if (code === '-509' || code === '-702' || code === '-705') return 'failed'
  // 消息内容模糊匹配
  const m = msg || ''
  if (/未完成|不满足条件|无资格/.test(m)) return 'incomplete'
  if (/库存|已领完|耗尽|没有库存/.test(m)) return 'exhausted'
  if (/行为异常/.test(m)) return 'suspicious'
  return 'unclaimed'
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * cron 触发时被调用
 * 检查全局开关，遍历所有有 Cookie 的用户进行领取
 * @param {'live'|'watch'} [mode='live'] — 直播（槽位 1-10）或看播（槽位 11-20）
 * 全部任务必须在 claimDeadline 秒内完成（0=不限）
 * 领取完毕后发送群通知 HTML 和个人通知 HTML（间隔10s）
 */
async function onCronTick(mode = 'live') {
  const config = getPluginConfig()
  if (!config?.incentive?.enabled) {
    logger.info('[Bilibili-Plugin] 激励领取已关闭，跳过')
    return
  }

  const modeLabel = mode === 'watch' ? '看播' : '直播'
  const claimTime = mode === 'watch'
    ? (config?.incentive?.watchCron || '0 30 0 * * ?')
    : (config?.incentive?.liveCron || config?.incentive?.claimTime || '01:00')
  const deadline = mode === 'watch'
    ? (config?.incentive?.watchDeadline ?? 12)
    : (config?.incentive?.claimDeadline ?? DEFAULT_DEADLINE)
  const allQq = listUserConfigs()
  if (!allQq.length) {
    logger.info(`[Bilibili-Plugin] 无配置用户，跳过${modeLabel}`)
    return
  }

  // 槽位范围：直播 1-10（索引 0-9），看播 11-20（索引 10-19）
  const slotRange = mode === 'watch'
    ? { start: 10, end: MAX_SLOTS }
    : { start: 0, end: 10 }

  logger.info(`[Bilibili-Plugin] 每日${modeLabel}激励领取开始 (${claimTime})，共 ${allQq.length} 个配置用户` +
    (deadline > 0 ? `，截止 ${deadline}s` : '，不限时'))

  // 全局取消信号
  const cancelSignal = { cancelled: false }
  let deadlineTimer
  if (deadline > 0) {
    deadlineTimer = setTimeout(() => {
      cancelSignal.cancelled = true
      logger.info(`[Bilibili-Plugin] 全局截止时间到（${deadline}s），取消剩余${modeLabel}任务`)
    }, deadline * 1000)
  }

  const promises = []
  for (const qq of allQq) {
    const cookies = loadAccountCookies(qq)
    if (!cookies) continue

    const cfg = loadUserConfig(qq)
    if (!cfg) continue

    const links = (cfg.links || []).slice(slotRange.start, slotRange.end).filter(l => l && typeof l === 'string')
    if (!links.length) continue

    logTask(`[${modeLabel}] 开始执行领取流程，共 ${links.length} 个链接`, qq)

    promises.push(
      startClaimRound(qq, cfg, cancelSignal, slotRange, mode).catch(err => {
        logger.error(`[Bilibili-Plugin] QQ ${qq} ${modeLabel}领取异常:`, err)
        return null
      }),
    )
  }

  const settled = await Promise.allSettled(promises)
  clearTimeout(deadlineTimer)
  logger.info(`[Bilibili-Plugin] 本轮${modeLabel}领取全部结束`)

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
 * 对单个用户的指定槽位范围执行领取
 * @param {string|number} qq
 * @param {object} cfg          — 完整个人配置（含 links[20]）
 * @param {{cancelled: boolean}} cancelSignal
 * @param {{start: number, end: number}} slotRange
 * @param {'live'|'watch'} [mode='live']
 * @returns {Promise<{qq, notifyGroup: number, slots: object[], clearedCount: number, mode: string}>}
 */
async function startClaimRound(qq, cfg, cancelSignal, slotRange = { start: 0, end: MAX_SLOTS }, mode = 'live') {
  const allLinks = Array.isArray(cfg.links) ? cfg.links : Array(MAX_SLOTS).fill('')
  const notifyGroup = cfg.notifyGroup || 0
  const slots = []
  const slotsToClear = new Set()
  let lastCode = ''

  const logCb = (msg) => logClaim(msg, qq)

  for (let slotIdx = slotRange.start; slotIdx < slotRange.end; slotIdx++) {
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

    // 截止时间到：获取剩余槽位的任务信息（使通知能显示任务名），再标记未开始
    if (cancelSignal.cancelled) {
      let client = null
      try { client = await createClient(qq) } catch {}
      for (let j = slotIdx; j < slotRange.end; j++) {
        const u = (allLinks[j] || '').trim()
        if (!u) {
          slots.push({ index: j + 1, status: 'empty' })
          continue
        }
        const tid = extractTaskId(u)
        let info = null
        if (client && tid) {
          try { info = await client.getAwardInfo(tid, logCb) } catch {}
        }
        slots.push({
          index: j + 1,
          status: 'skipped',
          taskId: tid || '',
          act_name: info?.act_name || '',
          task_name: info?.task_name || '',
          task_desc: info?.task_desc || '',
          award_name: info?.award_name || '',
        })
      }
      break
    }

    if (!taskId) {
      slots.push({ index: slotIdx + 1, status: 'config_error', errorCode: '?', errorMsg: '无法解析 task_id' })
      lastCode = '?'
      continue
    }

    logTask(`当前任务 ID: ${taskId}${lastCode ? `  ← code=${lastCode}` : ''}`, qq)

    // 预获取任务信息，使失败时也能展示任务名称
    let cachedAwardInfo = null
    let client = null
    try {
      client = await createClient(qq)
      if (client) {
        await client.ensureLoggedIn()
        cachedAwardInfo = await client.getAwardInfo(taskId, logCb)
        setTaskInfo(taskId, cachedAwardInfo)
      }
    } catch { /* getAwardInfo 失败不影响后续领取 */ }

    try {
      const configKey = mode === 'watch' ? 'watch' : 'claim'
      const { cdkey, awardInfo } = await doClaim(taskId, qq, cancelSignal, logCb, cachedAwardInfo, configKey)
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
      logger.info(`[Bilibili-Plugin] QQ ${qq} task ${taskId} 已领取: ${awardInfo.award_name} ${cdkey}`)
      slotsToClear.add(slotIdx)
      lastCode = '0'
    } catch (err) {
      // doClaim 失败时附带了 awardInfo，用它兜底展示任务名
      if (!cachedAwardInfo?.act_name && err.awardInfo) cachedAwardInfo = err.awardInfo
      const isDeadline = cancelSignal.cancelled
      const errMsg = isDeadline ? '达到全局截止时间' : err.message
      const { code, msg } = parseErrorCode(errMsg)

      // 先检查是否已领取——即使截止时间到，已领取仍需标记清空
      if (isAlreadyClaimed(err.message)) {
        slotsToClear.add(slotIdx)
      }

      // 截止触发在此任务执行期间：当前槽标记为"领取失败"，后续未开始的标记为"未开始"
      if (isDeadline) {
        slots.push({
          index: slotIdx + 1,
          status: 'failed',
          taskId,
          act_name: (cachedAwardInfo?.act_name) || '',
          task_name: (cachedAwardInfo?.task_name) || '',
          task_desc: (cachedAwardInfo?.task_desc) || '',
          award_name: (cachedAwardInfo?.award_name) || '',
          errorCode: code,
          errorMsg: msg,
        })
        // 获取后续槽位的任务信息（复用已创建的 client），使通知能显示任务名
        for (let j = slotIdx + 1; j < slotRange.end; j++) {
          const u = (allLinks[j] || '').trim()
          if (!u) {
            slots.push({ index: j + 1, status: 'empty' })
            continue
          }
          const tid = extractTaskId(u)
          let info = null
          if (client && tid) {
            try { info = await client.getAwardInfo(tid, logCb) } catch {}
          }
          slots.push({
            index: j + 1,
            status: 'skipped',
            taskId: tid || '',
            act_name: info?.act_name || '',
            task_name: info?.task_name || '',
            task_desc: info?.task_desc || '',
            award_name: info?.award_name || '',
          })
        }
        break
      }

      // 归类失败原因
      const failStatus = categorizeError(code, msg)
      lastCode = code

      slots.push({
        index: slotIdx + 1,
        status: failStatus,
        taskId,
        act_name: (cachedAwardInfo?.act_name) || '',
        task_name: (cachedAwardInfo?.task_name) || '',
        task_desc: (cachedAwardInfo?.task_desc) || '',
        award_name: (cachedAwardInfo?.award_name) || '',
        errorCode: code,
        errorMsg: msg,
      })
      logClaim(`${failStatus}: ${errMsg}`, qq)
      logger.warn(`[Bilibili-Plugin] QQ ${qq} task ${taskId} ${failStatus}: ${errMsg}`)
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

  return { qq, notifyGroup, slots, clearedCount: slotsToClear.size, mode }
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
  let totalClaimed = 0

  // 群通知展示所有非空状态（包含"未开始"和各类错误）
  const showStatuses = ['success', 'already_claimed', 'unclaimed', 'incomplete', 'exhausted',
    'suspicious', 'skipped', 'no_qualification', 'logged_out', 'not_yet_time',
    'config_error', 'api_error', 'failed']

  for (const m of members) {
    const activeSlots = m.slots.filter(s => showStatuses.includes(s.status))
    if (!activeSlots.length) {
      continue
    }

    const displaySlots = activeSlots.map(s => ({
      act_name: s.act_name || '',
      task_name: s.task_name || '',
      task_desc: s.task_desc || '',
      award_name: s.award_name || '',
      status: s.status,
      displayText: STATUS_DISPLAY_MAP[s.status] || '未知错误',
    }))

    for (const s of activeSlots) {
      if (s.status === 'success') totalSuccess++
      else if (s.status === 'already_claimed') totalClaimed++
      else totalFail++
    }

    memberList.push({ qq: m.qq, hasTasks: true, slots: displaySlots })
  }

  if (!memberList.length) return null

  const mode = members[0]?.mode || 'live'
  const modeLabel = mode === 'watch' ? '看播' : ''

  return {
    version: pluginVersion,
    yunzaiVersion,
    date,
    mode,
    modeLabel,
    groupId: gid,
    totalUsers: memberList.length,
    successCount: totalSuccess,
    failCount: totalFail,
    claimedCount: totalClaimed,
    members: memberList,
  }
}

/**
 * 群通知渲染失败时的文本降级
 */
function buildGroupTextFallback(gid, members) {
  const modeLabel = members[0]?.mode === 'watch' ? '看播' : ''
  const lines = [`[b站插件] 群 ${gid} ${modeLabel}激励领取结果`]
  const showStatuses = ['success', 'already_claimed', 'unclaimed', 'incomplete', 'exhausted',
    'suspicious', 'skipped', 'no_qualification', 'logged_out', 'not_yet_time',
    'config_error', 'api_error', 'failed']

  for (const m of members) {
    const activeSlots = m.slots.filter(s => showStatuses.includes(s.status))
    if (!activeSlots.length) continue

    // 按状态分组统计
    const counts = {}
    for (const s of activeSlots) {
      const label = STATUS_DISPLAY_MAP[s.status] || s.status
      counts[label] = (counts[label] || 0) + 1
    }
    const parts = Object.entries(counts).map(([k, v]) => `${v}${k}`)
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
      mode: userResult.mode || 'live',
      modeLabel: userResult.mode === 'watch' ? '看播' : '',
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
    displayText: STATUS_DISPLAY_MAP[s.status] || '未知错误',
    cdkey: s.cdkey || '',
  }))

  const modeLabel = userResult.mode === 'watch' ? '看播' : ''

  return {
    version: pluginVersion,
    yunzaiVersion,
    date,
    mode: userResult.mode || 'live',
    modeLabel,
    qq: userResult.qq,
    hasTasks: true,
    slots: slotList,
    clearedCount: userResult.clearedCount || 0,
  }
}

/**
 * 个人通知渲染失败时的文本降级
 */
function buildPersonalTextFallback(ur) {
  const modeLabel = ur.mode === 'watch' ? '看播' : ''
  const lines = [`[b站插件] 每日${modeLabel}激励领取结果`]
  const activeSlots = ur.slots.filter(s => s.status !== 'empty')

  if (!activeSlots.length) {
    lines.push('暂无任务')
    return lines.join('\n')
  }

  for (const s of activeSlots) {
    const prefix = `槽位${s.index}: `
    const display = STATUS_DISPLAY_MAP[s.status] || '未知错误'
    if (s.status === 'success') {
      lines.push(`${prefix}${display}${s.cdkey ? ` cdkey=${s.cdkey}` : ''}`)
    } else if (s.status === 'unclaimed') {
      // 未领取带 code 方便排查
      lines.push(`${prefix}${display} code=${s.errorCode}`)
    } else {
      lines.push(`${prefix}${display}`)
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

// ===================== 兜底任务 =====================

/**
 * 从 URL 中提取 task_id
 * @param {string} url
 * @returns {string|null}
 */
function extractTaskId(url) {
  if (!url) return null
  try {
    const id = new URL(url).searchParams.get('task_id')
    if (id) return id
  } catch {}
  const m = url.match(/task_id=([^&\s]+)/)
  return m ? m[1] : null
}

/**
 * 每日兜底任务 cron 入口（默认 23:55）
 * 遍历所有有配置的用户，对全局每日任务链接逐个检查领取
 * 每条链接间隔 15s，多人并行，不删除链接
 */
async function onFallbackTick() {
  const config = getPluginConfig()
  if (!config?.incentive?.enabled) {
    logger.info('[Bilibili-Plugin] 激励领取已关闭，跳过兜底')
    return
  }

  const links = (config?.incentive?.dailyTaskLinks || []).filter(Boolean)
  if (!links.length) {
    logger.info('[Bilibili-Plugin] 无每日兜底任务链接，跳过')
    return
  }

  const fallbackTime = config?.incentive?.fallbackTime || '23:55'
  const allQq = listUserConfigs()
  if (!allQq.length) {
    logger.info('[Bilibili-Plugin] 无配置用户，跳过兜底')
    return
  }

  logger.info(`[Bilibili-Plugin] 每日兜底任务开始 (${fallbackTime})，共 ${allQq.length} 个用户，${links.length} 个链接`)

  const promises = []
  for (const qq of allQq) {
    const cookies = loadAccountCookies(qq)
    if (!cookies) continue

    const cfg = loadUserConfig(qq)
    if (!cfg) continue

    logTask(`[兜底] 开始执行，共 ${links.length} 个链接`, qq)
    promises.push(
      processUserFallback(qq, links).catch(err => {
        logger.error(`[Bilibili-Plugin] QQ ${qq} 兜底异常:`, err)
        return null
      }),
    )
  }

  const settled = await Promise.allSettled(promises)
  const userResults = settled
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  logger.info(`[Bilibili-Plugin] 每日兜底任务结束，共 ${userResults.length} 个用户完成`)

  if (!userResults.length) return

  // 发送群通知和个人通知
  const hasGroupNotify = await sendGroupNotifies(userResults)
  if (hasGroupNotify) await sleep(10000)
  await sendPersonalNotifies(userResults)
}

/**
 * 对单个用户执行兜底领取
 * @param {string|number} qq
 * @param {string[]} links — 全局每日任务链接
 * @returns {Promise<{qq, notifyGroup: number, slots: object[], clearedCount: number}>}
 */
async function processUserFallback(qq, links) {
  const cfg = loadUserConfig(qq)
  const notifyGroup = cfg?.notifyGroup || 0
  const slots = []
  const logCb = (msg) => logClaim(msg, qq)

  // 统一创建一次 client，供 getAwardInfo 和 tryClaimOnce 复用
  let client = null
  try {
    client = await createClient(qq)
  } catch {}

  for (const url of links) {
    const taskId = extractTaskId(url)
    if (!taskId) {
      slots.push({ index: slots.length + 1, status: 'config_error', errorCode: '?', errorMsg: '无法解析 task_id' })
      continue
    }

    logTask(`[兜底] 当前任务 ID: ${taskId}`, qq)

    // 预获取任务信息，使失败时也能展示任务名称
    let cachedAwardInfo = null
    if (client) {
      try {
        cachedAwardInfo = await client.getAwardInfo(taskId, logCb)
      } catch {}
    }

    if (!client) {
      slots.push({ index: slots.length + 1, status: 'api_error', taskId, errorCode: '-1', errorMsg: '无法创建 API 客户端' })
      await sleep(15000)
      continue
    }

    // 单次领取请求，不重试
    const result = await client.tryClaimOnce(taskId, cachedAwardInfo || {})

    if (result.success) {
      slots.push({
        index: slots.length + 1,
        status: 'success',
        taskId,
        act_name: cachedAwardInfo?.act_name || '',
        task_name: cachedAwardInfo?.task_name || '',
        task_desc: cachedAwardInfo?.task_desc || '',
        award_name: cachedAwardInfo?.award_name || '',
        cdkey: result.cdkey || '',
      })
      logClaim(`[兜底] 已领取: code=0${result.cdkey ? ` cdkey=${result.cdkey}` : ''}`, qq)
    } else if (result.code === 202031) {
      // 已领取过
      slots.push({
        index: slots.length + 1,
        status: 'already_claimed',
        taskId,
        act_name: cachedAwardInfo?.act_name || '',
        task_name: cachedAwardInfo?.task_name || '',
        task_desc: cachedAwardInfo?.task_desc || '',
        award_name: cachedAwardInfo?.award_name || '',
      })
      logClaim(`[兜底] 已领取过: code=${result.code}`, qq)
    } else {
      const failStatus = categorizeError(String(result.code), result.message)
      slots.push({
        index: slots.length + 1,
        status: failStatus,
        taskId,
        act_name: cachedAwardInfo?.act_name || '',
        task_name: cachedAwardInfo?.task_name || '',
        task_desc: cachedAwardInfo?.task_desc || '',
        award_name: cachedAwardInfo?.award_name || '',
        errorCode: String(result.code),
        errorMsg: result.message,
      })
      logClaim(`[兜底] ${failStatus}: code=${result.code} msg=${result.message}`, qq)
    }

    await sleep(15000)  // 每条链接间隔 15s
  }

  return { qq, notifyGroup, slots, clearedCount: 0, mode: 'fallback' }
}

// ===================== 手动领取 =====================

/**
 * #领取每日激励 — 手动触发指定用户的每日任务激励领取
 * 复用 processUserFallback 逻辑（tryClaimOnce、15s 间隔），仅执行单用户
 * @param {string|number} qq
 * @returns {Promise<object|null>} render('incentive/user', ...) 所需的数据，或 null
 */
async function manualDailyClaim(qq) {
  const config = getPluginConfig()
  const links = (config?.incentive?.dailyTaskLinks || []).filter(Boolean)
  if (!links.length) return null

  const result = await processUserFallback(qq, links)
  return buildPersonalNotifyData(result, todayStr())
}

export { onCronTick, onFallbackTick, manualDailyClaim }
