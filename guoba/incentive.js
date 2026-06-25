/**
 * guoba/incentive.js — 激励计划配置（从 guoba.support.js 迁移）
 *
 * 对应 defSet/config.yaml 模板变量:
 *   incentive_enabled, incentive_liveCron, incentive_claimDeadline,
 *   incentive_claim_threadCount, incentive_claim_maxRetry, incentive_claim_retryInterval, incentive_claim_timeout,
 *   incentive_watchCron, incentive_watchDeadline,
 *   incentive_watch_threadCount, incentive_watch_maxRetry, incentive_watch_retryInterval, incentive_watch_timeout,
 *   incentive_fallbackCron,
 *   incentive_dailyTaskLink1~4
 */
import path from 'node:path'
import { pluginRoot } from '../components/constants.js'
import { MAX_SLOTS } from '../modules/incentive/Config.js'

const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

const defaults = {
  incentive_enabled: 'true',
  incentive_liveCron: '0 0 1 * * ?',
  incentive_claimDeadline: '40',
  incentive_claim_threadCount: '2',
  incentive_claim_maxRetry: '30',
  incentive_claim_retryInterval: '1.0',
  incentive_claim_timeout: '10',
  incentive_watchCron: '0 30 0 * * ?',
  incentive_watchDeadline: '12',
  incentive_watch_threadCount: '1',
  incentive_watch_maxRetry: '30',
  incentive_watch_retryInterval: '1.0',
  incentive_watch_timeout: '10',
  incentive_fallbackCron: '0 55 23 * * ?',
  incentive_dailyTaskLink1: '',
  incentive_dailyTaskLink2: '',
  incentive_dailyTaskLink3: '',
  incentive_dailyTaskLink4: '',
}

export function getSchema() {
  return [
    // ==================== 激励计划 ====================
    { label: '激励计划', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'incentive.enabled',
      label: '每日领取开关',
      helpMessage: '是否开启每日自动领取激励奖励',
      bottomHelpMessage: '领取时间由下方"直播领取 cron"字段控制',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    // ---- 直播激励领取 ----
    { component: 'Divider', label: '直播激励领取', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'incentive.liveCron',
      label: '直播领取 cron',
      helpMessage: 'cron 表达式，格式：秒 分 时 日 月 周',
      bottomHelpMessage: '默认 0 0 1 * * ? 表示每天凌晨1点整',
      component: 'EasyCron',
      required: true,
      componentProps: { showSecond: true, defaultValue: '0 0 1 * * ?' },
    },
    {
      field: 'incentive.claimDeadline',
      label: '直播截止时间（秒）',
      helpMessage: '所有用户的直播领取总时间上限',
      bottomHelpMessage: '到达此时间后取消剩余直播任务，0=不限时，默认 40',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 0, max: 300, defaultValue: 40 },
    },
    {
      field: 'incentive.claim.threadCount',
      label: '直播并发线程数',
      helpMessage: '同时发送请求的 worker 数量',
      bottomHelpMessage: '建议 2-5，过高可能触发风控',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 1, max: 10, defaultValue: 2 },
    },
    {
      field: 'incentive.claim.maxRetry',
      label: '直播重试次数',
      helpMessage: '单个 worker 最大重试次数',
      bottomHelpMessage: '默认 30',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 1, max: 300, defaultValue: 30 },
    },
    {
      field: 'incentive.claim.retryInterval',
      label: '直播重试间隔（秒）',
      bottomHelpMessage: '请求失败后等待此时间再重试，默认 1.0 秒',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 0.1, max: 10, step: 0.1, precision: 1, defaultValue: 1.0 },
    },
    {
      field: 'incentive.claim.timeout',
      label: '直播请求超时（秒）',
      bottomHelpMessage: '单次领取请求的网络超时，默认 10 秒',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 3, max: 60, defaultValue: 10 },
    },

    // ---- 看播激励领取 ----
    { component: 'Divider', label: '看播激励领取', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'incentive.watchCron',
      label: '看播领取 cron',
      helpMessage: 'cron 表达式，格式：秒 分 时 日 月 周',
      bottomHelpMessage: '默认 0 30 0 * * ? 表示每天 00:30 执行',
      component: 'EasyCron',
      required: true,
      componentProps: { showSecond: true, defaultValue: '0 30 0 * * ?' },
    },
    {
      field: 'incentive.watchDeadline',
      label: '看播截止时间（秒）',
      helpMessage: '所有用户的看播领取总时间上限',
      bottomHelpMessage: '到达此时间后取消剩余看播任务，0=不限时，默认 12',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 0, max: 300, defaultValue: 12 },
    },
    {
      field: 'incentive.watch.threadCount',
      label: '看播并发线程数',
      helpMessage: '同时发送请求的 worker 数量',
      bottomHelpMessage: '看播默认为 1，过高可能触发风控',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 1, max: 10, defaultValue: 1 },
    },
    {
      field: 'incentive.watch.maxRetry',
      label: '看播重试次数',
      helpMessage: '单个 worker 最大重试次数',
      bottomHelpMessage: '默认 30',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 1, max: 300, defaultValue: 30 },
    },
    {
      field: 'incentive.watch.retryInterval',
      label: '看播重试间隔（秒）',
      bottomHelpMessage: '请求失败后等待此时间再重试，默认 1.0 秒',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 0.1, max: 10, step: 0.1, precision: 1, defaultValue: 1.0 },
    },
    {
      field: 'incentive.watch.timeout',
      label: '看播请求超时（秒）',
      bottomHelpMessage: '单次领取请求的网络超时，默认 10 秒',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 3, max: 60, defaultValue: 10 },
    },

    // ---- 每日任务激励兜底 ----
    { component: 'Divider', label: '每日任务激励兜底', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'incentive.fallbackCron',
      label: '兜底领取 cron',
      helpMessage: 'cron 表达式，格式：秒 分 时 日 月 周',
      bottomHelpMessage: '默认 0 55 23 * * ? 表示每天 23:55 执行',
      component: 'EasyCron',
      required: true,
      componentProps: { showSecond: true, defaultValue: '0 55 23 * * ?' },
    },
    {
      field: 'incentive.dailyTaskLink1',
      label: '每日任务链接 1',
      helpMessage: '全局每日激励任务链接（含 task_id）',
      component: 'Input',
      componentProps: { placeholder: '活动链接' },
    },
    {
      field: 'incentive.dailyTaskLink2',
      label: '每日任务链接 2',
      helpMessage: '全局每日激励任务链接（含 task_id）',
      component: 'Input',
      componentProps: { placeholder: '活动链接' },
    },
    {
      field: 'incentive.dailyTaskLink3',
      label: '每日任务链接 3',
      helpMessage: '全局每日激励任务链接（含 task_id）',
      component: 'Input',
      componentProps: { placeholder: '活动链接' },
    },
    {
      field: 'incentive.dailyTaskLink4',
      label: '每日任务链接 4',
      helpMessage: '全局每日激励任务链接（含 task_id）',
      component: 'Input',
      componentProps: { placeholder: '活动链接' },
    },
  ]
}

export function getDefaults() {
  return defaults
}

export { configPath, defaultConfigPath, MAX_SLOTS }
