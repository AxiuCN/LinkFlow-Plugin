/**
 * guoba/index.js — 统一导出 supportGuoba()
 * 合并各模块 schema，锅巴注册时调用此方法
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginRoot } from '../components/constants.js'
import { loadUserConfig, saveUserConfig, listUserConfigs, MAX_SLOTS } from '../modules/incentive/Config.js'
import * as mainMod from './main.js'
import * as subscribeMod from './subscribe.js'
import * as incentiveMod from './incentive.js'

const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

/** 合并所有模块的默认值 */
const allDefaults = {
  ...mainMod.getDefaults(),
  ...subscribeMod.getDefaults(),
  ...incentiveMod.getDefaults(),
}

/** 读取模板文件 */
function getTemplate(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
    logger.error(`[LinkFlow] 模板不存在: ${filePath}`)
  } catch (e) {
    logger.error(`[LinkFlow] 读取模板失败: ${e}`)
  }
  return ''
}

/** 模板变量替换 */
function generateConfig(templatePath, values) {
  const template = getTemplate(templatePath)
  return template.replace(/\${(\w+)}/g, (_, name) => (values[name] !== undefined ? String(values[name]) : ''))
}

/** 解析 YAML */
function parseYaml(filePath) {
  try {
    if (fs.existsSync(filePath)) return YAML.parse(fs.readFileSync(filePath, 'utf8')) || {}
  } catch (e) {
    logger.error(`[LinkFlow] 解析失败: ${filePath}`, e)
  }
  return {}
}

/**
 * 递归扁平化锅巴传入的数据
 * 统一转为 underscore 分隔的扁平 key
 * @param {object} obj — 锅巴传入的 data
 * @param {string} [prefix=''] — 递归前缀
 * @returns {object} 扁平化后的键值对
 */
function flattenForTemplate(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { [prefix]: obj }
  }
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      Object.assign(result, flattenForTemplate(val, newKey))
    } else {
      result[newKey] = val
    }
  }
  return result
}

/**
 * 从扁平或嵌套 data 中安全取值
 * @param {object} data
 * @param {string} flatKey — 点分隔的扁平键名
 * @returns {any}
 */
function getNested(data, flatKey) {
  if (data[flatKey] !== undefined) return data[flatKey]
  const parts = flatKey.split('.')
  let cur = data
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'linkflow-plugin',
      title: '链流插件',
      description: 'B站综合功能插件，支持UP主直播订阅推送、B站激励计划抢奖励',
      author: ['@阿修Axiu'],
      authorLink: ['https://github.com/AxiuCN'],
      link: 'https://github.com/AxiuCN/LinkFlow-Plugin',
      isV3: true,
      isV2: false,
      showInMenu: 'auto',
      icon: 'mdi:link-box-variant',
      iconColor: '#42b883',
      iconPath: path.join(pluginRoot, 'resources', 'images', 'icon.ico'),
    },
    configInfo: {
      schemas: [
        ...mainMod.getSchema(),
        ...subscribeMod.getSchema(),
        ...incentiveMod.getSchema(),
        // ==================== 用户配置列表 ====================
        {
          field: 'incentive.users',
          label: '激励用户配置',
          component: 'GSubForm',
          componentProps: {
            multiple: true,
            schemas: [
              {
                field: 'qq', label: 'QQ', component: 'Input', required: true,
                componentProps: { placeholder: 'QQ号' },
              },
              {
                field: 'notifyGroup', label: '通知群', component: 'InputNumber',
                componentProps: { min: 0, placeholder: '0=不通知' },
              },
              ...Array.from({ length: MAX_SLOTS }, (_, i) => ({
                field: `link${i + 1}`,
                label: i < 10 ? `直播兑换链接${i + 1}` : `看播兑换链接${i + 1}`,
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
        const watch = userCfg.incentive?.watch || {}
        const subscribe = userCfg.subscribe || {}
        const sdyn = subscribe.dynamic || {}
        const slive = subscribe.live || {}
        const spush = subscribe.push || {}

        // 用户激励配置列表
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
        const liveCron = userCfg.incentive?.liveCron || userCfg.incentive?.claimCron

        return {
          // 全局
          'global.enabled': userCfg.global?.enabled ?? true,
          'login.pollTimeout': userCfg.login?.pollTimeout ?? 180,

          // 动态订阅
          'subscribe.dynamic.enabled': sdyn.enabled ?? true,
          'subscribe.dynamic.cron': sdyn.cron ?? '0 */10 * * * ?',
          'subscribe.dynamic.timeRange': sdyn.timeRange ?? 7200,
          'subscribe.dynamic.forward': sdyn.forward ?? false,
          'subscribe.dynamic.sleep': sdyn.sleep ?? 0,

          // 直播推送
          'subscribe.live.enabled': slive.enabled ?? true,
          'subscribe.live.cron': slive.cron ?? '10 * * * * ?',
          'subscribe.live.endPush': slive.endPush ?? true,
          'subscribe.push.forward': spush.forward ?? false,
          'subscribe.push.rePush': spush.rePush ?? false,
          'subscribe.push.sleep': spush.sleep ?? 0,

          // 激励
          'incentive.enabled': userCfg.incentive?.enabled ?? true,
          'incentive.liveCron': liveCron ?? '0 0 1 * * ?',
          'incentive.claimDeadline': userCfg.incentive?.claimDeadline ?? 40,
          'incentive.claim.threadCount': claim.threadCount ?? 2,
          'incentive.claim.maxRetry': claim.maxRetry ?? 30,
          'incentive.claim.retryInterval': claim.retryInterval ?? 1.0,
          'incentive.claim.timeout': claim.timeout ?? 10,
          'incentive.watchCron': userCfg.incentive?.watchCron ?? '0 30 0 * * ?',
          'incentive.watchDeadline': userCfg.incentive?.watchDeadline ?? 12,
          'incentive.watch.threadCount': watch.threadCount ?? 1,
          'incentive.watch.maxRetry': watch.maxRetry ?? 30,
          'incentive.watch.retryInterval': watch.retryInterval ?? 1.0,
          'incentive.watch.timeout': watch.timeout ?? 10,
          'incentive.fallbackCron': userCfg.incentive?.fallbackCron ?? '0 55 23 * * ?',
          'incentive.dailyTaskLink1': dailyLinks[0] || '',
          'incentive.dailyTaskLink2': dailyLinks[1] || '',
          'incentive.dailyTaskLink3': dailyLinks[2] || '',
          'incentive.dailyTaskLink4': dailyLinks[3] || '',
          'incentive.users': userList,
        }
      },

      setConfigData(data, { Result }) {
        try {
          // 1. 扁平化锅巴数据（兼容嵌套和扁平两种格式）
          const flatData = flattenForTemplate(data)

          // 2. 合并默认值 + 用户值
          const values = { ...allDefaults }
          for (let [key, val] of Object.entries(flatData)) {
            key = key.replace(/\./g, '_')
            if (key === 'incentive_users' || key.startsWith('incentive_users_')) continue
            values[key] = val
          }

          // 3. 生成 config.yaml（模板变量替换）
          const content = generateConfig(defaultConfigPath, values)
          const dir = path.dirname(configPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(configPath, content, 'utf8')

          // 4. 保存激励用户配置
          const users = getNested(data, 'incentive.users') || []
          for (const entry of users) {
            if (!entry.qq) continue
            const links = Array.from({ length: MAX_SLOTS }, (_, i) => entry[`link${i + 1}`] || '')
            saveUserConfig(String(entry.qq), { links, notifyGroup: entry.notifyGroup || 0 })
          }

          return Result.ok({}, '保存成功~')
        } catch (e) {
          logger.error('[LinkFlow] 保存配置失败:', e)
          return Result.error('保存失败')
        }
      },
    },
  }
}
