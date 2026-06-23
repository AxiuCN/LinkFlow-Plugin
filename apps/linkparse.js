import { handleMessage } from '../modules/linkparse/index.js'
import { getPluginConfig } from '../components/config.js'
import { isGroupAllowed, addGroup, removeGroup } from '../modules/linkparse/Whitelist.js'

export class LinkFlowParse extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]链接解析',
      dsc: '多平台链接解析与视频下载',
      event: 'message',
      priority: -9999,  // 最低优先级，让其他指令先匹配
      rule: [
        { reg: /^#开启解析$/i, fnc: 'cmdEnable' },
        { reg: /^#关闭解析$/i, fnc: 'cmdDisable' },
        { reg: /https?:\/\//i, fnc: 'autoParse', log: false },
      ],
    })
  }

  /**
   * #开启解析 — 将当前群加入解析白名单
   */
  async cmdEnable(e) {
    if (!e.isGroup) {
      return this.reply('[LinkFlow] 仅群聊支持此指令')
    }
    if (!e.isMaster && !e.isAdmin) {
      return this.reply('[LinkFlow] 仅群主/管理员可操作')
    }

    const gid = String(e.group_id)
    if (isGroupAllowed(gid)) {
      return this.reply('[LinkFlow] 本群已开启链接解析')
    }

    try {
      addGroup(gid)
      return this.reply('[LinkFlow] 本群已开启链接解析')
    } catch (err) {
      logger?.error('[LinkFlow] 添加群白名单失败:', err)
      return this.reply('[LinkFlow] 操作失败，请查看日志')
    }
  }

  /**
   * #关闭解析 — 从白名单移除当前群
   */
  async cmdDisable(e) {
    if (!e.isGroup) {
      return this.reply('[LinkFlow] 仅群聊支持此指令')
    }
    if (!e.isMaster && !e.isAdmin) {
      return this.reply('[LinkFlow] 仅群主/管理员可操作')
    }

    const gid = String(e.group_id)
    if (!isGroupAllowed(gid)) {
      return this.reply('[LinkFlow] 本群未开启链接解析')
    }

    try {
      removeGroup(gid)
      return this.reply('[LinkFlow] 本群已关闭链接解析')
    } catch (err) {
      logger?.error('[LinkFlow] 移除群白名单失败:', err)
      return this.reply('[LinkFlow] 操作失败，请查看日志')
    }
  }

  /**
   * 自动链接解析 — 消息中含 URL 时触发
   */
  async autoParse(e) {
    const config = getPluginConfig()

    // 总开关：仅在明确为 false 时阻断
    if (config?.global?.enabled === false) return false

    // 解析总开关
    if (config?.linkparse?.enabled === false) return false

    // 群白名单检查
    if (e.isGroup && !isGroupAllowed(e.group_id)) return false

    // 处理链接
    await handleMessage(e, e.msg)
    return false  // 不阻断后续处理器
  }
}
