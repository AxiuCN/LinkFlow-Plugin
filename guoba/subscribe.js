/**
 * guoba/subscribe.js — 直播推送配置
 *
 * 对应 defSet/config.yaml 模板变量:
 *   subscribe_live_enabled, subscribe_live_cron, subscribe_live_endPush,
 *   subscribe_push_forward, subscribe_push_rePush, subscribe_push_sleep
 */
import path from 'node:path'
import { pluginRoot } from '../components/constants.js'

const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

const defaults = {
  subscribe_live_enabled: 'true',
  subscribe_live_cron: '10 * * * * ?',
  subscribe_live_endPush: 'true',
  subscribe_push_forward: 'false',
  subscribe_push_rePush: 'false',
  subscribe_push_sleep: '0',
}

export function getSchema() {
  return [
    // ==================== 直播推送 ====================
    { label: '直播推送', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'subscribe.live.enabled',
      label: '直播推送',
      helpMessage: '开启后定时轮询已订阅 UP 主的开播/下播状态',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'subscribe.live.cron',
      label: '轮询频率',
      helpMessage: 'cron 表达式（秒 分 时 日 月 周）',
      bottomHelpMessage: '默认每分钟第 10 秒检查: 10 * * * * ?',
      component: 'EasyCron',
      required: true,
      componentProps: { showSecond: true, defaultValue: '10 * * * * ?' },
    },
    {
      field: 'subscribe.live.endPush',
      label: '下播通知',
      helpMessage: '主播下播时是否推送下播消息',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    // --- 推送行为 ---
    { component: 'Divider', label: '推送行为', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'subscribe.push.forward',
      label: '合并转发',
      helpMessage: '使用合并转发消息发送推送，降低刷屏感',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: false },
    },
    {
      field: 'subscribe.push.rePush',
      label: '标题变更重推',
      helpMessage: '直播间标题变更时再次推送（用于直播标题含关键信息的场景）',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: false },
    },
    {
      field: 'subscribe.push.sleep',
      label: '群发间隔（秒）',
      helpMessage: '多群依次推送的间隔时间',
      bottomHelpMessage: '避免同时推送多群触发风控，默认 0 秒（无间隔）',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 0, max: 30, defaultValue: 0 },
    },
  ]
}

export function getDefaults() {
  return defaults
}

export { configPath, defaultConfigPath }
