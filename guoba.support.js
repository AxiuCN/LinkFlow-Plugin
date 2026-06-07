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
  incentive_claimCron: '0 0 1 * * ?',
  incentive_fallbackCron: '0 55 23 * * ?',
  incentive_claimDeadline: 40,
  incentive_claim_threadCount: 2,
  incentive_claim_maxRetry: 30,
  incentive_claim_retryInterval: 1.0,
  incentive_claim_timeout: 10,
  incentive_dailyTaskLink1: '',
  incentive_dailyTaskLink2: '',
  incentive_dailyTaskLink3: '',
  incentive_dailyTaskLink4: '',
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

        // ---- 领取设置 ----
        {
            component: "Divider",
            label: "领取设置",
            componentProps: {
                orientation: "left",
                plain: true,
            },
        },
        },
        {
          field: 'incentive.claimCron',
          label: '主领取 cron',
          helpMessage: 'cron 表达式，格式：秒 分 时 日 月 周',
          bottomHelpMessage: '默认 0 0 1 * * ? 表示每天凌晨1点整',
          component: 'EasyCron',
          required: true,
          componentProps: { showSecond: true, defaultValue: '0 0 1 * * ?' },
        },
        {
          field: 'incentive.claimDeadline',
          label: '全局截止（秒）',
          helpMessage: '所有用户的总领取时间上限',
          bottomHelpMessage: '到达此时间后取消剩余任务，0=不限时，默认 40',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 0, max: 300, defaultValue: 40 },
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

        // ---- 兜底设置 ----
        {
            component: "Divider",
            label: "兜底设置",
            componentProps: {
                orientation: "left",
                plain: true,
            },
        },
        },

        // ==================== 兜底任务 ====================
        { label: '兜底任务', component: 'SOFT_GROUP_BEGIN' },
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
                label: `兑换链接${i + 1}`,
                component: 'Input',
                componentProps: { placeholder: '活动链接（含 task_id）' },
              })),
            ],
          },
        },
      ],

      getConfigData() {
        const userCfg = parseYaml(configPath)
        const claim = userCfg.incentive?.claim || {}

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

        return {
          'login.pollTimeout': userCfg.login?.pollTimeout ?? mainDefaults.login_pollTimeout,
          'incentive.enabled': userCfg.incentive?.enabled ?? mainDefaults.incentive_enabled,
          'incentive.claimTime': userCfg.incentive?.claimTime ?? mainDefaults.incentive_claimTime,
          'incentive.fallbackCron': userCfg.incentive?.fallbackCron ?? mainDefaults.incentive_fallbackCron,
          'incentive.claimDeadline': userCfg.incentive?.claimDeadline ?? mainDefaults.incentive_claimDeadline,
          'incentive.claim.threadCount': claim.threadCount ?? mainDefaults.incentive_claim_threadCount,
          'incentive.claim.maxRetry': claim.maxRetry ?? mainDefaults.incentive_claim_maxRetry,
          'incentive.claim.retryInterval': claim.retryInterval ?? mainDefaults.incentive_claim_retryInterval,
          'incentive.claim.timeout': claim.timeout ?? mainDefaults.incentive_claim_timeout,
          'incentive.dailyTaskLink1': dailyLinks[0] || '',
          'incentive.dailyTaskLink2': dailyLinks[1] || '',
          'incentive.dailyTaskLink3': dailyLinks[2] || '',
          'incentive.dailyTaskLink4': dailyLinks[3] || '',
          'incentive.users': userList,
        }
      },

      setConfigData(data, { Result }) {
        try {
          const values = { ...mainDefaults }
          for (const [key, val] of Object.entries(data)) {
            if (key.startsWith('incentive.users')) continue
            values[key.replace('.', '_')] = val
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
