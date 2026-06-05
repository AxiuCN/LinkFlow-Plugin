import { loadUserConfig, saveUserConfig, createDefaultUserConfig, createGlobalDefaultConfig, loadWhitelist, saveWhitelist, isWhitelisted, MAX_SLOTS } from '../components/IncentiveConfig.js'
import { onCronTick } from '../components/IncentiveScheduler.js'
import { getPluginConfig } from '../components/config.js'
import { getTaskInfo, setTaskInfo } from '../components/TaskCache.js'
import { createClient } from '../components/Claimer.js'
import { render } from '../components/render.js'

export class BiliIncentive extends plugin {
  constructor() {
    super({
      name: '[b站插件]激励计划',
      dsc: 'B站UP主激励计划抢奖励',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#激励(创建|生成)配置$/i, fnc: 'cmdCreateConfig' },
        { reg: /^#激励添加\s+\d{1,2}\s+/i, fnc: 'cmdAddLink' },
        { reg: /^#激励列表$/i, fnc: 'cmdListLinks' },
        { reg: /^#激励删除\s+\d{1,2}$/i, fnc: 'cmdRemoveLink' },
        { reg: /^#(添加|增加)激励白名单\s*/i, fnc: 'cmdAddWhitelist' },
        { reg: /^#(删除|移除)激励白名单\s*/i, fnc: 'cmdRemoveWhitelist' },
        { reg: /^#激励白名单$/i, fnc: 'cmdWhitelist' },
      ],
    })

    const config = getPluginConfig()
    const claimTime = config?.incentive?.claimTime || '01:00'
    const [hour, minute] = claimTime.split(':').map(Number)
    const hh = Math.min(23, Math.max(0, isNaN(hour) ? 1 : hour))
    const mm = Math.min(59, Math.max(0, isNaN(minute) ? 0 : minute))
    this.task = {
      name: 'biliIncentiveSchedule',
      fnc: () => this.tick(),
      cron: `${0} ${mm} ${hh} * * ?`,
      log: false,
    }
  }

  async tick() {
    await onCronTick()
  }

  // ========== 配置创建 ==========

  /**
   * #激励创建配置 — 为当前 QQ 生成个人配置（13 个空槽位）
   */
  async cmdCreateConfig(e) {
    if (!isWhitelisted(e.user_id) && !e.isMaster) {
      return this.reply('[b站插件] 您不在白名单中，无权使用激励功能')
    }

    const existing = loadUserConfig(e.user_id)
    if (existing) {
      return this.reply('[b站插件] 您已有个人配置，如需重置请手动删除配置文件')
    }

    const notifyGroup = e.isGroup ? e.group_id : 0
    createGlobalDefaultConfig(e.user_id, notifyGroup)
    this.reply('[b站插件] 个人配置已创建。使用 #激励添加 <序号> <链接> | #B站帮助 查看详情')
  }

  // ========== 链接管理 ==========

  /**
   * #激励添加 <序号> <链接> — 填入指定槽位
   * 序号 1-13，覆盖旧值
   */
  async cmdAddLink(e) {
    if (!isWhitelisted(e.user_id) && !e.isMaster) {
      return this.reply('[b站插件] 您不在白名单中')
    }

    let cfg = loadUserConfig(e.user_id)
    if (!cfg) {
      // 无配置时自动从模板创建
      const notifyGroup = e.isGroup ? e.group_id : 0
      cfg = createDefaultUserConfig(e.user_id, notifyGroup)
    }

    // 解析序号和链接
    const raw = e.msg.replace(/^#激励添加\s*/i, '').trim()
    const parts = raw.split(/\s+/)
    const slot = parseInt(parts[0])
    if (slot < 1 || slot > MAX_SLOTS) {
      return this.reply(`[b站插件] 序号无效，请输入 1-${MAX_SLOTS}`)
    }
    const urlPart = parts.slice(1).join('')
    if (!urlPart) {
      return this.reply(`[b站插件] 请提供链接，格式: #激励添加 ${slot} <链接>`)
    }

    // 提取 task_id 验证链接有效性
    let taskId = null
    try { taskId = new URL(urlPart).searchParams.get('task_id') } catch {}
    if (!taskId) {
      const m = urlPart.match(/task_id=([^&\s]+)/)
      if (m) taskId = m[1]
    }
    if (!taskId) {
      return this.reply('[b站插件] 未能从链接中提取 task_id')
    }

    // 确保 links 数组长度足够
    const links = Array.isArray(cfg.links) ? [...cfg.links] : Array(MAX_SLOTS).fill('')
    while (links.length < MAX_SLOTS) links.push('')

    links[slot - 1] = urlPart
    cfg.links = links

    saveUserConfig(e.user_id, cfg)
    this.reply(`[b站插件] 已填入 槽位${slot} | task_id=${taskId}`)
  }

  /**
   * #激励列表 — HTML 渲染展示 13 槽位配置
   */
  async cmdListLinks(e) {
    const cfg = loadUserConfig(e.user_id)
    if (!cfg) {
      return this.reply('[b站插件] 您还没有配置。发送 #激励创建配置 开始 | #B站帮助 查看详情')
    }

    const links = Array.isArray(cfg.links) ? cfg.links : []
    const claimTime = getPluginConfig()?.incentive?.claimTime || '01:00'

    const slots = []
    for (let i = 0; i < MAX_SLOTS; i++) {
      const url = (links[i] || '').trim()
      if (!url) continue
      const taskId = url.match(/task_id=([^&\s]+)/)?.[1] || ''

      let info = taskId ? getTaskInfo(taskId) : null
      if (!info && taskId) {
        try {
          const client = await createClient(e.user_id)
          if (client) {
            info = await client.getAwardInfo(taskId)
            setTaskInfo(taskId, info)
          }
        } catch { /* 按需查询失败 */ }
      }

      slots.push({
        index: i + 1,
        award_name: info?.award_name || '',
        task_name: info?.task_name || '',
        act_name: info?.act_name || '',
      })
    }

    if (!slots.length) {
      return this.reply('[b站插件] 您的激励配置为空，使用 #激励添加 <序号> <链接> 填入链接')
    }

    const img = await render('incentiveList', 'index', {
      qq: e.user_id,
      claimTime,
      notifyGroup: cfg.notifyGroup || 0,
      slots,
      totalFilled: slots.length,
      totalSlots: MAX_SLOTS,
    }, 'png')

    this.reply([segment.at(e.user_id), img], false, { recallMsg: 60 })
  }

  /**
   * #激励删除 <序号> — 清空指定槽位
   */
  async cmdRemoveLink(e) {
    let cfg = loadUserConfig(e.user_id)
    if (!cfg) {
      return this.reply('[b站插件] 您还没有配置')
    }

    const raw = e.msg.replace(/^#激励删除\s*/i, '').trim()
    const slot = parseInt(raw)
    if (slot < 1 || slot > MAX_SLOTS) {
      return this.reply(`[b站插件] 序号无效，请输入 1-${MAX_SLOTS}`)
    }

    const links = Array.isArray(cfg.links) ? [...cfg.links] : Array(MAX_SLOTS).fill('')
    while (links.length < MAX_SLOTS) links.push('')

    if (!links[slot - 1]) {
      return this.reply(`[b站插件] 槽位${slot} 已经是空的`)
    }

    links[slot - 1] = ''
    cfg.links = links
    saveUserConfig(e.user_id, cfg)
    this.reply(`[b站插件] 已清空 槽位${slot}`)
  }

  // ========== 白名单管理（主人） ==========

  /**
   * #添加激励白名单 [@QQ] — 添加 QQ 到白名单
   */
  async cmdAddWhitelist(e) {
    if (!e.isMaster) return false

    const qq = extractAtQQ(e)
    if (!qq) return this.reply('[b站插件] 请指定要添加的 QQ，如 #添加激励白名单 @用户')

    const wl = loadWhitelist()
    const strQq = String(qq)
    if (wl.users.includes(strQq)) return this.reply(`[b站插件] ${qq} 已在白名单中`)
    wl.users.push(strQq)
    saveWhitelist(wl)
    this.reply(`[b站插件] 已添加 ${qq} 到激励白名单`)
  }

  /**
   * #删除激励白名单 [@QQ] — 从白名单移除 QQ
   */
  async cmdRemoveWhitelist(e) {
    if (!e.isMaster) return false

    const qq = extractAtQQ(e)
    if (!qq) return this.reply('[b站插件] 请指定要删除的 QQ')

    const wl = loadWhitelist()
    const strQq = String(qq)
    if (!wl.users.includes(strQq)) return this.reply(`[b站插件] ${qq} 不在白名单中`)
    wl.users = wl.users.filter(u => u !== strQq)
    saveWhitelist(wl)
    this.reply(`[b站插件] 已从白名单移除 ${qq}`)
  }

  /**
   * #激励白名单 — 查看白名单
   */
  async cmdWhitelist(e) {
    if (!e.isMaster) return false
    const wl = loadWhitelist()
    const status = wl.enabled ? '启用' : '关闭'
    const users = wl.users.length ? wl.users.join(', ') : '无'
    this.reply(`[b站插件] 激励白名单 (${status})\n${users}`)
  }
}

/**
 * 从消息中提取 @ 的 QQ，或直接数字
 * @param {object} e
 * @returns {string|null}
 */
function extractAtQQ(e) {
  // loader.js 的 dealEvent 已将 @ 的 QQ 写入 e.at
  if (e.at) return String(e.at)
  // 从纯文本的最后一段取数字
  const raw = e.msg.replace(/^#(添加|增加|删除|移除)激励白名单\s*/i, '').trim()
  if (/^\d+$/.test(raw)) return raw
  return null
}
