import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { loadUserConfig, saveUserConfig, listUserConfigs, MAX_SLOTS } from './components/IncentiveConfig.js'

const pluginRoot = path.join(process.cwd(), 'plugins/Bilibili-Plugin')

// ========== 主配置（config.yaml）==========

const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

const mainDefaults = {
  login_pollTimeout: 180,
  incentive_enabled: true,
  incentive_liveCron: '0 0 1 * * ?',
  incentive_claimDeadline: 40,
  incentive_claim_threadCount: 2,
  incentive_claim_maxRetry: 30,
  incentive_claim_retryInterval: 1.0,
  incentive_claim_timeout: 10,
  incentive_watchCron: '0 30 0 * * ?',
  incentive_watchDeadline: 12,
  incentive_watch_threadCount: 1,
  incentive_watch_maxRetry: 30,
  incentive_watch_retryInterval: 1.0,
  incentive_watch_timeout: 10,
  incentive_fallbackCron: '0 55 23 * * ?',
  incentive_dailyTaskLink1: '',
  incentive_dailyTaskLink2: '',
  incentive_dailyTaskLink3: '',
  incentive_dailyTaskLink4: '',
  livePush_enabled: true,
  livePush_cron: '10 * * * * ?',
  livePush_endPush: true,
  livePush_forward: false,
  livePush_rePush: false,
  livePush_sleep: 0,
}

function getTemplate(path) {
  try {
    if (fs.existsSync(path)) return fs.readFileSync(path, 'utf8')
    logger.error(`[Bilibili-Plugin] 模板不存在: ${path}`)
  } catch (e) {
    logger.error(`[Bilibili-Plugin] 读取模板失败: ${e}`)
  }
  return ''
}

function generateConfig(templatePath, values) {
  const template = getTemplate(templatePath)
  return template.replace(/\${(\w+)}/g, (_, name) => (values[name] !== undefined ? values[name] : ''))
}

function parseYaml(path) {
  try {
    if (fs.existsSync(path)) return YAML.parse(fs.readFileSync(path, 'utf8')) || {}
  } catch (e) {
    logger.error(`[Bilibili-Plugin] 解析失败: ${path}`, e)
  }
  return {}
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'bilibili-plugin',
      title: 'Bilibili-Plugin',
      description: 'B站综合功能插件，支持UP主激励计划抢奖励、直播推送等功能',
      author: ['阿修Axiu'],
      authorLink: ['https://github.com/AxiuCN'],
      link: 'https://github.com/AxiuCN/Bilibili-Plugin',
      isV3: true,
      isV2: false,
      showInMenu: 'auto',
      iconPath: path.join(pluginRoot, 'resources/images/icon.ico'),
    },
    configInfo: {
      schemas: [
        // ==================== B站账号 ====================
        { label: 'B站账号', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'login.pollTimeout',
          label: '扫码超时',
          helpMessage: '扫码登录轮询超时时间（秒）',
          bottomHelpMessage: '超过此时间未扫码则自动取消，默认 180 秒',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 30, max: 600, defaultValue: 180 },
        },

        // ==================== 激励计划 ====================
        { label: '激励计划', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'incentive.enabled',
          label: '每日领取开关',
          helpMessage: '是否开启每日自动领取激励奖励',
          bottomHelpMessage: '领取时间由下方"领取时间"字段控制',
          component: 'Switch',
          required: true,
          componentProps: { defaultValue: true },
        },

        // ---- 直播激励领取 ----
        {
            component: "Divider",
            label: "直播激励领取",
            componentProps: {
                orientation: "left",
                plain: true,
            },
        },
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

        // ---- 直播领取设置 ----
        {
            component: "Divider",
            label: "直播领取设置",
            componentProps: {
                orientation: "left",
                plain: true,
            },
        },
        {
          field: 'incentive.claim.threadCount',
          label: '并发线程数',
          helpMessage: '同时发送请求的 worker 数量',
          bottomHelpMessage: '建议 2-5，过高可能触发风控',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 1, max: 10, defaultValue: 2 },
        },
        {
          field: 'incentive.claim.maxRetry',
          label: '单线程重试次数',
          helpMessage: '单个 worker 最大重试次数',
          bottomHelpMessage: '默认 30',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 1, max: 300, defaultValue: 30 },
        },
        {
          field: 'incentive.claim.retryInterval',
          label: '重试间隔（秒）',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 0.1, max: 10, step: 0.1, precision: 1, defaultValue: 1.0 },
        },
        {
          field: 'incentive.claim.timeout',
          label: '请求超时（秒）',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 3, max: 60, defaultValue: 10 },
        },

        // ---- 看播激励领取 ----
        {
            component: "Divider",
            label: "看播激励领取",
            componentProps: {
                orientation: "left",
                plain: true,
            },
        },
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

        // ---- 看播领取设置 ----
        {
            component: "Divider",
            label: "看播领取设置",
            componentProps: {
                orientation: "left",
                plain: true,
            },
        },
        {
          field: 'incentive.watch.threadCount',
          label: '并发线程数',
          helpMessage: '同时发送请求的 worker 数量',
          bottomHelpMessage: '看播默认为 1，过高可能触发风控',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 1, max: 10, defaultValue: 1 },
        },
        {
          field: 'incentive.watch.maxRetry',
          label: '单线程重试次数',
          helpMessage: '单个 worker 最大重试次数',
          bottomHelpMessage: '默认 30',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 1, max: 300, defaultValue: 30 },
        },
        {
          field: 'incentive.watch.retryInterval',
          label: '重试间隔（秒）',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 0.1, max: 10, step: 0.1, precision: 1, defaultValue: 1.0 },
        },
        {
          field: 'incentive.watch.timeout',
          label: '请求超时（秒）',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 3, max: 60, defaultValue: 10 },
        },

        // ---- 每日任务激励兜底 ----
        {
            component: "Divider",
            label: "每日任务激励兜底",
            componentProps: {
                orientation: "left",
                plain: true,
            },
        },

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
          component: 'Input',
          componentProps: { placeholder: '活动链接' },
        },
        {
          field: 'incentive.dailyTaskLink3',
          label: '每日任务链接 3',
          component: 'Input',
          componentProps: { placeholder: '活动链接' },
        },
        {
          field: 'incentive.dailyTaskLink4',
          label: '每日任务链接 4',
          component: 'Input',
          componentProps: { placeholder: '活动链接' },
        },

        // ==================== 用户配置列表 ====================
        {
          field: 'incentive.users',
          label: '用户配置',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              { field: 'qq', label: 'QQ', component: 'Input', required: true,
                componentProps: { placeholder: 'QQ号' } },
              { field: 'notifyGroup', label: '通知群', component: 'InputNumber',
                componentProps: { min: 0, placeholder: '0=不通知' } },
              ...Array.from({ length: MAX_SLOTS }, (_, i) => ({
                field: `link${i + 1}`,
                label: i < 10 ? `直播兑换链接${i + 1}` : `看播兑换链接${i + 1}`,
                component: 'Input',
                componentProps: { placeholder: '活动链接（含 task_id）' },
              })),
            ],
          },
        },

        // ==================== 直播推送 ====================
        { label: '直播推送', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'livePush.enabled',
          label: '直播推送开关',
          helpMessage: '是否开启B站直播开播/下播推送',
          bottomHelpMessage: '每分钟第10秒检查订阅的直播间状态',
          component: 'Switch',
          required: true,
          componentProps: { defaultValue: true },
        },
        {
          field: 'livePush.cron',
          label: '推送检查 cron',
          helpMessage: 'cron 表达式，格式：秒 分 时 日 月 周',
          bottomHelpMessage: '默认 10 * * * * ? 表示每分钟第10秒',
          component: 'EasyCron',
          required: true,
          componentProps: { showSecond: true, defaultValue: '10 */1 * * * ?' },
        },
        {
          field: 'livePush.endPush',
          label: '下播推送',
          helpMessage: '主播下播时是否发送下播通知',
          component: 'Switch',
          required: true,
          componentProps: { defaultValue: true },
        },
        {
          field: 'livePush.forward',
          label: '合并转发推送',
          helpMessage: '使用合并转发发送推送消息',
          component: 'Switch',
          required: true,
          componentProps: { defaultValue: false },
        },
        {
          field: 'livePush.rePush',
          label: '改标题二次推送',
          helpMessage: '直播间标题变更时再次推送',
          component: 'Switch',
          required: true,
          componentProps: { defaultValue: false },
        },
        {
          field: 'livePush.sleep',
          label: '群发间隔（秒）',
          helpMessage: '推送给多个群时的间隔时间',
          bottomHelpMessage: '避免同时推送到多个群造成风控，默认 0',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 0, max: 30, defaultValue: 0 },
        },

      ],

      getConfigData() {
        const userCfg = parseYaml(configPath)
        const claim = userCfg.incentive?.claim || {}
        const watch = userCfg.incentive?.watch || {}

        const userList = listUserConfigs().map(qq => {
          const cfg = loadUserConfig(qq) || { links: [], notifyGroup: 0 }
          const links = Array.isArray(cfg.links) ? cfg.links : []
          const entry = { qq, notifyGroup: cfg.notifyGroup || 0 }
          for (let i = 0; i < MAX_SLOTS; i++) {
            entry[`link${i + 1}`] = links[i] || ''
          }
          return entry
        })

        const dailyLinks = userCfg.incentive?.dailyTaskLinks || []
        const livePush = userCfg.livePush || {}

        // 兼容旧版 claimCron
        const liveCron = userCfg.incentive?.liveCron || userCfg.incentive?.claimCron

        return {
          'login.pollTimeout': userCfg.login?.pollTimeout ?? mainDefaults.login_pollTimeout,
          'incentive.enabled': userCfg.incentive?.enabled ?? mainDefaults.incentive_enabled,
          'incentive.liveCron': liveCron ?? mainDefaults.incentive_liveCron,
          'incentive.claimDeadline': userCfg.incentive?.claimDeadline ?? mainDefaults.incentive_claimDeadline,
          'incentive.claim.threadCount': claim.threadCount ?? mainDefaults.incentive_claim_threadCount,
          'incentive.claim.maxRetry': claim.maxRetry ?? mainDefaults.incentive_claim_maxRetry,
          'incentive.claim.retryInterval': claim.retryInterval ?? mainDefaults.incentive_claim_retryInterval,
          'incentive.claim.timeout': claim.timeout ?? mainDefaults.incentive_claim_timeout,
          'incentive.watchCron': userCfg.incentive?.watchCron ?? mainDefaults.incentive_watchCron,
          'incentive.watchDeadline': userCfg.incentive?.watchDeadline ?? mainDefaults.incentive_watchDeadline,
          'incentive.watch.threadCount': watch.threadCount ?? mainDefaults.incentive_watch_threadCount,
          'incentive.watch.maxRetry': watch.maxRetry ?? mainDefaults.incentive_watch_maxRetry,
          'incentive.watch.retryInterval': watch.retryInterval ?? mainDefaults.incentive_watch_retryInterval,
          'incentive.watch.timeout': watch.timeout ?? mainDefaults.incentive_watch_timeout,
          'incentive.fallbackCron': userCfg.incentive?.fallbackCron ?? mainDefaults.incentive_fallbackCron,
          'incentive.dailyTaskLink1': dailyLinks[0] || '',
          'incentive.dailyTaskLink2': dailyLinks[1] || '',
          'incentive.dailyTaskLink3': dailyLinks[2] || '',
          'incentive.dailyTaskLink4': dailyLinks[3] || '',
          'livePush.enabled': livePush.enabled ?? mainDefaults.livePush_enabled,
          'livePush.cron': livePush.cron ?? mainDefaults.livePush_cron,
          'livePush.endPush': livePush.endPush ?? mainDefaults.livePush_endPush,
          'livePush.forward': livePush.forward ?? mainDefaults.livePush_forward,
          'livePush.rePush': livePush.rePush ?? mainDefaults.livePush_rePush,
          'livePush.sleep': livePush.sleep ?? mainDefaults.livePush_sleep,
          'incentive.users': userList,
        }
      },

      setConfigData(data, { Result }) {
        try {
          const values = { ...mainDefaults }
          for (const [key, val] of Object.entries(data)) {
            if (key.startsWith('incentive.users')) continue
            values[key.replace(/\./g, '_')] = val
          }
          const content = generateConfig(defaultConfigPath, values)
          const dir = path.dirname(configPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(configPath, content, 'utf8')

          const users = data['incentive.users'] || []
          for (const entry of users) {
            if (!entry.qq) continue
            const links = Array.from({ length: MAX_SLOTS }, (_, i) => entry[`link${i + 1}`] || '')
            saveUserConfig(String(entry.qq), { links, notifyGroup: entry.notifyGroup || 0 })
          }

          return Result.ok({}, '保存成功~')
        } catch (e) {
          logger.error('[Bilibili-Plugin] 保存配置失败:', e)
          return Result.error('保存失败')
        }
      },
    },
  }
}
