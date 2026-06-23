/**
 * guoba/subscribe.js — 动态/直播订阅配置
 *
 * 对应 defSet/config.yaml 模板变量:
 *   subscribe_dynamic_enabled, subscribe_dynamic_cron,
 *   subscribe_live_enabled, subscribe_live_cron, subscribe_live_endPush,
 *   subscribe_push_forward, subscribe_push_rePush, subscribe_push_sleep
 */
import path from 'node:path'
import { pluginRoot } from '../components/constants.js'

const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

const defaults = {
  subscribe_dynamic_enabled: 'true',
  subscribe_dynamic_cron: '0 */23 * * * ?',
  subscribe_live_enabled: 'true',
  subscribe_live_cron: '10 * * * * ?',
  subscribe_live_endPush: 'true',
  subscribe_push_forward: 'false',
  subscribe_push_rePush: 'false',
  subscribe_push_sleep: '0',
  subscribe_dynamic_timeRange: '7200',
}

export function getSchema() {
  return [
    // ==================== 动态订阅 ====================
    { label: '动态订阅', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'subscribe.dynamic.enabled',
      label: '动态推送开关',
      helpMessage: '是否开启UP主动态订阅推送',
      bottomHelpMessage: '关闭后停止所有动态轮询和推送',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'subscribe.dynamic.cron',
      label: '动态轮询频率',
      helpMessage: 'cron 表达式，格式：秒 分 时 日 月 周',
      bottomHelpMessage: '默认每23分钟检查一次。格式: 0 */23 * * * ?',
      component: 'EasyCron',
      required: true,
      componentProps: { showSecond: true, defaultValue: '0 */23 * * * ?' },
    },
    {
      field: 'subscribe.dynamic.timeRange',
      label: '动态时间窗口（秒）',
      helpMessage: '超过此时间的动态不推送',
      bottomHelpMessage: '默认 7200 秒（2小时），设为 86400 则推送全天动态',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 60, max: 86400, defaultValue: 7200 },
    },

    // ==================== 直播订阅 ====================
    { label: '直播订阅', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'subscribe.live.enabled',
      label: '直播推送开关',
      helpMessage: '是否开启直播开播/下播推送',
      bottomHelpMessage: '关闭后停止所有直播轮询和推送',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'subscribe.live.cron',
      label: '直播轮询频率',
      helpMessage: 'cron 表达式，格式：秒 分 时 日 月 周',
      bottomHelpMessage: '默认每分钟第10秒检查。格式: 10 * * * * ?',
      component: 'EasyCron',
      required: true,
      componentProps: { showSecond: true, defaultValue: '10 * * * * ?' },
    },
    {
      field: 'subscribe.live.endPush',
      label: '下播推送',
      helpMessage: '主播下播时是否发送下播通知',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    // ==================== 推送设置 ====================
    { label: '推送设置', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'subscribe.push.forward',
      label: '合并转发推送',
      helpMessage: '使用合并转发发送推送消息',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: false },
    },
    {
      field: 'subscribe.push.rePush',
      label: '换标题重推',
      helpMessage: '直播间标题变更时再次推送',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: false },
    },
    {
      field: 'subscribe.push.sleep',
      label: '群发间隔（秒）',
      helpMessage: '推送给多个群时的间隔时间',
      bottomHelpMessage: '避免同时推送到多个群造成风控，默认 0',
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
