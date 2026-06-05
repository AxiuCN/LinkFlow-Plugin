import { onCronTick } from '../components/IncentiveScheduler.js'
import { getPluginConfig } from '../components/config.js'

/**
 * 激励调度器 — 根据配置动态设定领取时间
 * cron 表达式由 config.yaml 的 incentive.claimTime 决定
 */
export class BiliSchedule extends plugin {
  constructor() {
    super({
      name: '[b站插件]调度器',
      dsc: 'B站激励调度器',
      event: 'message',
      priority: 500,
      rule: [],
    })

    // 从配置读取领取时间，动态生成 cron
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
}
