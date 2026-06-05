import { loadUserConfig, saveUserConfig, createDefaultUserConfig, loadWhitelist, saveWhitelist, isWhitelisted } from '../components/IncentiveConfig.js'

export class BiliIncentive extends plugin {
  constructor() {
    super({
      name: '[b站插件]激励计划',
      dsc: 'B站UP主激励计划抢奖励',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#激励(创建|生成)配置$/i, fnc: 'cmdCreateConfig' },
        { reg: /^#激励添加\s+/i, fnc: 'cmdAddLink' },
        { reg: /^#激励列表$/i, fnc: 'cmdListLinks' },
        { reg: /^#激励删除/i, fnc: 'cmdRemoveLink' },
        { reg: /^#(添加|增加)激励白名单\s*/i, fnc: 'cmdAddWhitelist' },
        { reg: /^#(删除|移除)激励白名单\s*/i, fnc: 'cmdRemoveWhitelist' },
        { reg: /^#激励白名单$/i, fnc: 'cmdWhitelist' },
      ],
    })
  }

  // ========== 配置创建 ==========

  /**
   * #激励创建配置 — 为当前 QQ 生成个人配置（从全局默认复制）
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
    createDefaultUserConfig(e.user_id, notifyGroup)
    this.reply(`[b站插件] 个人配置已创建。使用 #激励添加 <链接> 添加兑换链接 | #B站帮助 查看详情`)
  }

  // ========== 链接管理 ==========

  /**
   * #激励添加 <链接> — 向当前用户的个人配置添加链接
   * 格式: #激励添加 <链接>
   * 可选从 #激励列表 中的编号后追加: #激励添加 <编号> <链接>
   */
  async cmdAddLink(e) {
    if (!isWhitelisted(e.user_id) && !e.isMaster) {
      return this.reply('[b站插件] 您不在白名单中')
    }

    let cfg = loadUserConfig(e.user_id)
    if (!cfg) {
      return this.reply('[b站插件] 请先发送 #激励创建配置 创建个人配置')
    }

    // 解析参数: 可能的格式 "23:29 <链接>" 或纯链接
    const raw = e.msg.replace(/^#激励添加\s*/i, '').trim()
    // 尝试匹配 "时间 链接" 格式
    let time = null
    let urlPart = raw
    const timeMatch = raw.match(/^(\d{1,2}:\d{2})\s+(.*)/)
    if (timeMatch) {
      time = timeMatch[1].padStart(5, '0')
      urlPart = timeMatch[2].trim()
    }

    // 提取 task_id
    let taskId = null
    try { taskId = new URL(urlPart).searchParams.get('task_id') } catch {}
    if (!taskId) {
      const m = urlPart.match(/task_id=([^&\s]+)/)
      if (m) taskId = m[1]
    }
    if (!taskId) {
      return this.reply('[b站插件] 未能从链接中提取 task_id')
    }

    // 如果没指定时间，尝试自动匹配到下一个有效时段
    if (!time) {
      const now = new Date()
      const hh = now.getHours()
      const mm = now.getMinutes()
      // 找最近的未来时段
      const slots = cfg.triggers || []
      const sorted = slots.filter(s => {
        const [sh, sm] = s.time.split(':').map(Number)
        return sh > hh || (sh === hh && sm >= mm)
      })
      if (sorted.length > 0) {
        time = sorted[0].time
      } else if (slots.length > 0) {
        time = slots[0].time
      }
    }

    if (!time) {
      return this.reply('[b站插件] 请指定时段，格式: #激励添加 23:29 <链接>')
    }

    // 写入对应时段
    let found = false
    for (const t of cfg.triggers) {
      if (t.time === time) {
        // 去重
        if (t.links.some(l => l.url === urlPart)) {
          return this.reply(`[b站插件] 该链接已在时段 ${time} 中`)
        }
        t.links.push({ url: urlPart, expire: '' })
        found = true
        break
      }
    }

    if (!found) {
      cfg.triggers.push({ time, links: [{ url: urlPart, expire: '' }] })
    }

    saveUserConfig(e.user_id, cfg)
    this.reply(`[b站插件] 已添加到时段 ${time} | task_id=${taskId}`)
  }

  /**
   * #激励列表 — 查看当前用户的配置
   */
  async cmdListLinks(e) {
    const cfg = loadUserConfig(e.user_id)
    if (!cfg?.triggers?.length) {
      return this.reply('[b站插件] 您还没有配置。发送 #激励创建配置 开始 | #B站帮助 查看详情')
    }

    const now = new Date()
    const lines = ['[b站插件] 您的激励配置']
    for (const t of cfg.triggers) {
      const validLinks = (t.links || []).filter(l => {
        if (!l.expire) return true
        return new Date(l.expire) >= now
      })
      if (validLinks.length === 0) continue
      lines.push(`⌚ ${t.time} (${validLinks.length} 个链接)`)
      for (let i = 0; i < validLinks.length; i++) {
        const l = validLinks[i]
        lines.push(`  ${i + 1}. ${l.url.slice(0, 60)}${l.expire ? ` [至${l.expire}]` : ''}`)
      }
    }

    if (cfg.notifyGroup) {
      lines.push(`通知群: ${cfg.notifyGroup}`)
    }
    this.reply(lines.join('\n'))
  }

  /**
   * #激励删除 <编号> — 从当前用户配置删除链接
   * 格式: #激励删除 <时段> <序号>
   */
  async cmdRemoveLink(e) {
    let cfg = loadUserConfig(e.user_id)
    if (!cfg?.triggers?.length) {
      return this.reply('[b站插件] 您还没有配置')
    }

    const raw = e.msg.replace(/^#激励删除\s*/i, '').trim()
    // 格式: "23:29 1" 或 "1"
    const parts = raw.split(/\s+/)

    // 简单模式: 遍历所有时段找到第 N 个链接
    if (parts.length === 1 && /^\d+$/.test(parts[0])) {
      const idx = parseInt(parts[0]) - 1
      let count = 0
      for (const t of cfg.triggers) {
        const links = t.links || []
        if (idx < count + links.length) {
          const linkIdx = idx - count
          const removed = links.splice(linkIdx, 1)[0]
          saveUserConfig(e.user_id, cfg)
          return this.reply(`[b站插件] 已从 ${t.time} 删除: ${removed.url.slice(0, 40)}`)
        }
        count += links.length
      }
      return this.reply('[b站插件] 未找到该编号的链接')
    }

    // 时段+序号模式: "23:29 1"
    if (parts.length === 2) {
      const [timeStr, numStr] = parts
      if (/^\d{1,2}:\d{2}$/.test(timeStr) && /^\d+$/.test(numStr)) {
        const t = cfg.triggers.find(x => x.time === timeStr.padStart(5, '0'))
        if (!t) return this.reply(`[b站插件] 未找到时段 ${timeStr}`)
        const idx = parseInt(numStr) - 1
        const links = t.links || []
        if (idx < 0 || idx >= links.length) return this.reply(`[b站插件] 时段 ${timeStr} 没有第 ${numStr} 个链接`)
        const removed = links.splice(idx, 1)[0]
        saveUserConfig(e.user_id, cfg)
        return this.reply(`[b站插件] 已从 ${timeStr} 删除`)
      }
    }

    this.reply('[b站插件] 格式: #激励删除 <时段> <序号> | 或 #激励删除 <序号>')
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
