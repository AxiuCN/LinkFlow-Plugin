import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginRoot } from './constants.js'

/** 路径常量 */
const userCfgDir = path.join(pluginRoot, 'config', 'incentive_config')
const whitelistPath = path.join(userCfgDir, 'whitelist.yaml')

/** 固定槽位数 */
const MAX_SLOTS = 13

/** 添加/创建时的模板：qq.yaml.example（git 已追踪） */
const userCfgTemplate = path.join(pluginRoot, 'config', 'incentive_config', 'qq.yaml.example')
/** #激励创建配置 模板：incentive_config.yaml（运行时生成），.example 兜底 */
const globalCfgTemplate = path.join(pluginRoot, 'config', 'incentive_config.yaml')
const globalCfgExample = globalCfgTemplate + '.example'

// ========== 白名单 ==========

/**
 * 读取白名单
 * @returns {{enabled: boolean, users: string[]}}
 */
function loadWhitelist() {
  try {
    if (!fs.existsSync(whitelistPath)) return { enabled: true, users: [] }
    return YAML.parse(fs.readFileSync(whitelistPath, 'utf8')) || { enabled: true, users: [] }
  } catch (e) {
    logger.error('[Bilibili-Plugin] 读取白名单失败:', e)
    return { enabled: true, users: [] }
  }
}

/**
 * 写入白名单
 * @param {{enabled: boolean, users: string[]}} data
 */
function saveWhitelist(data) {
  fs.mkdirSync(path.dirname(whitelistPath), { recursive: true })
  fs.writeFileSync(whitelistPath, YAML.stringify(data, null, 2), 'utf8')
}

/**
 * 检查指定 QQ 是否在白名单中
 * @param {string|number} qq
 * @returns {boolean}
 */
function isWhitelisted(qq) {
  const wl = loadWhitelist()
  if (!wl.enabled) return true
  return wl.users.includes(String(qq))
}

// ========== 个人配置 ==========

/**
 * 个人配置文件名后缀
 */
const USER_CFG_EXT = '.yaml'

/**
 * 获取指定 QQ 的配置文件路径
 * @param {string|number} qq
 * @returns {string}
 */
function userCfgPath(qq) {
  return path.join(userCfgDir, `${qq}${USER_CFG_EXT}`)
}

/**
 * 读取指定 QQ 的个人配置
 * @param {string|number} qq
 * @returns {object|null} { links: string[13], notifyGroup: number } 或 null
 */
function loadUserConfig(qq) {
  try {
    const file = userCfgPath(qq)
    if (!fs.existsSync(file)) return null
    return YAML.parse(fs.readFileSync(file, 'utf8')) || null
  } catch (e) {
    logger.error(`[Bilibili-Plugin] 读取用户 ${qq} 配置失败:`, e)
    return null
  }
}

/**
 * 确保配置包含 13 个槽位，不足补空串，超长截断
 * @param {object} data
 * @returns {object}
 */
function normalizeUserConfig(data) {
  const links = Array.isArray(data?.links) ? [...data.links] : []
  while (links.length < MAX_SLOTS) links.push('')
  links.length = MAX_SLOTS
  return {
    links,
    notifyGroup: data?.notifyGroup || 0,
  }
}

/**
 * 写入指定 QQ 的个人配置
 * @param {string|number} qq
 * @param {object} data
 */
function saveUserConfig(qq, data) {
  fs.mkdirSync(userCfgDir, { recursive: true })
  const normalized = normalizeUserConfig(data)
  fs.writeFileSync(userCfgPath(qq), YAML.stringify(normalized, null, 2), 'utf8')
}

/**
 * 为指定 QQ 创建默认配置（从模板文件复制，保留注释）
 * @param {string|number} qq
 * @param {number} [notifyGroup]
 * @param {string} [templatePath] - 指定模板路径，不指定则用 userCfgTemplate
 * @returns {object} 创建后的配置
 */
function createDefaultUserConfig(qq, notifyGroup = 0, templatePath = userCfgTemplate) {
  let content = 'links: []\nnotifyGroup: 0\n'
  try {
    if (templatePath && fs.existsSync(templatePath)) {
      content = fs.readFileSync(templatePath, 'utf8')
    }
  } catch (e) {
    logger.warn('[Bilibili-Plugin] 读取配置模板失败，使用默认:', e)
  }

  const ng = notifyGroup || 0
  content = content.replace(/^notifyGroup:\s*\d+/m, `notifyGroup: ${ng}`)

  fs.mkdirSync(userCfgDir, { recursive: true })
  fs.writeFileSync(userCfgPath(qq), content, 'utf8')
  return normalizeUserConfig(YAML.parse(content))
}

/**
 * #激励创建配置 专用：从全局模板（incentive_config.yaml）创建
 * 不存在时尝试 .example，再不济走硬编码
 */
function createGlobalDefaultConfig(qq, notifyGroup = 0) {
  let template = globalCfgTemplate
  if (!fs.existsSync(template)) {
    template = fs.existsSync(globalCfgExample) ? globalCfgExample : ''
  }
  return createDefaultUserConfig(qq, notifyGroup, template || '')
}

/**
 * 列出所有有个人配置的 QQ
 * @returns {string[]}
 */
function listUserConfigs() {
  try {
    if (!fs.existsSync(userCfgDir)) return []
    const exclude = ['whitelist', 'qq']
    return fs.readdirSync(userCfgDir)
      .filter(f => f.endsWith(USER_CFG_EXT) && !exclude.includes(f.replace(USER_CFG_EXT, '')))
      .map(f => f.replace(USER_CFG_EXT, ''))
  } catch {
    return []
  }
}

export { MAX_SLOTS, loadWhitelist, saveWhitelist, isWhitelisted, loadUserConfig, saveUserConfig, createDefaultUserConfig, createGlobalDefaultConfig, listUserConfigs, userCfgDir }
