import { doClaim } from '../components/Claimer.js'
import { loadLinks, addLink, removeLink } from '../components/Storage.js'

export class BiliIncentive extends plugin {
  constructor() {
    super({
      name: '[B站插件]激励计划',
      dsc: 'B站UP主激励计划抢奖励',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#激励列表$', fnc: 'cmdListLinks' },
        { reg: '^#激励添加\\s+', fnc: 'cmdAddLink' },
        { reg: '^#激励删除\\s*\\d*$', fnc: 'cmdRemoveLink' },
        { reg: '^#激励开始(\\s*\\d*)$', fnc: 'cmdStartClaim' },
      ],
    })
  }

  /**
   * #激励添加 <链接> — 添加活动链接
   */
  async cmdAddLink(e) {
    const raw = e.msg.replace(/^#激励添加\s*/, '').trim()
    if (!raw) {
      return this.reply('[B站插件] 请提供活动链接。用法: #激励添加 <链接>')
    }

    let taskId = null
    try {
      taskId = new URL(raw).searchParams.get('task_id')
    } catch {
      const m = raw.match(/task_id=([^&\s]+)/)
      if (m) taskId = m[1]
    }
    if (!taskId) {
      return this.reply('[B站插件] 未能从链接中提取 task_id，请检查链接格式')
    }

    const link = addLink({ task_id: taskId, url: raw })
    if (!link) {
      return this.reply(`[B站插件] 该活动已在列表中: task_id=${taskId}`)
    }
    this.reply(`[B站插件] 已添加: ID=${link.id}, task_id=${taskId}`)
  }

  /**
   * #激励列表 — 查看已添加的活动链接
   */
  async cmdListLinks(e) {
    const links = loadLinks()
    if (!links.length) {
      return this.reply('[B站插件] 暂无活动链接。使用 #激励添加 <链接> 添加 | #B站帮助 查看全部指令')
    }
    const lines = ['[B站插件] 活动列表']
    for (const l of links) {
      lines.push(`${l.id}. task_id=${l.task_id}  |  ${l.added_at}`)
    }
    lines.push(`共 ${links.length} 个 | 使用 #激励开始 [编号] 抢奖励`)
    this.reply(lines.join('\n'))
  }

  /**
   * #激励删除 <编号> — 删除指定活动链接
   */
  async cmdRemoveLink(e) {
    const m = e.msg.match(/^#激励删除\s*(\d+)$/)
    if (!m) return this.reply('[B站插件] 请提供要删除的编号。用法: #激励删除 <编号>')

    const id = parseInt(m[1], 10)
    const removed = removeLink(id)
    if (!removed) {
      return this.reply(`[B站插件] 未找到编号 ${id}。使用 #激励列表 查看`)
    }
    this.reply(`[B站插件] 已删除: ID=${id}`)
  }

  /**
   * #激励开始 [编号] — 批量领取奖励，一次性汇总回复
   * 不加编号抢全部，加编号抢指定
   */
  async cmdStartClaim(e) {
    const links = loadLinks()
    if (!links.length) {
      return this.reply('[B站插件] 暂无活动链接。请先用 #激励添加 <链接> 添加')
    }

    const m = e.msg.match(/^#激励开始\s*(\d+)?$/)
    const targetId = m?.[1] ? parseInt(m[1], 10) : null
    let targets
    if (targetId) {
      targets = links.filter(l => l.id === targetId)
      if (!targets.length) return this.reply(`[B站插件] 未找到编号 ${targetId} 的链接`)
    } else {
      targets = links
    }

    // 逐个领取，静默执行，最后汇总
    const lines = ['[B站插件] 领取结果']
    const cancelSignal = { cancelled: false }

    for (const link of targets) {
      try {
        const { cdkey, awardInfo } = await doClaim(link.task_id, e.user_id, cancelSignal)
        lines.push(`ID=${link.id} ✓ ${awardInfo.award_name}: ${cdkey}`)
      } catch (err) {
        if (err.message.includes('已取消')) {
          lines.push(`ID=${link.id} — 已取消`)
          break
        }
        lines.push(`ID=${link.id} ✗ ${err.message}`)
      }
    }

    const success = lines.filter(l => l.includes('✓')).length
    const fail = lines.length - 1 - success // lines[0] is header
    const total = lines.length - 1
    lines.push(`共 ${total} 个: ${success} 成功, ${fail} 失败`)

    this.reply(lines.join('\n'))
  }
}
