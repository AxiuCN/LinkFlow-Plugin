import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginRoot } from '../../components/constants.js'

/** 路径常量 */
const userCfgDir = path.join(pluginRoot, 'config', 'incentive_config')
const whitelistPath = path.join(userCfgDir, 'whitelist.yaml')

/** 固定槽位数（1-10 直播，11-20 看播） */
const MAX_SLOTS = 20

/** 添加/创建时的模板：qq.yaml.example（git 已追踪） */
const userCfgTemplate = path.join(pluginRoot, 'config', 'incentive_config', 'qq.yaml.example')
/** #激励创建配置 模板：defSet/incentive_config.yaml，.example 兜底 */
const globalCfgTemplate = path.join(pluginRoot, 'config', 'incentive_config.yaml')
const globalCfgExample = path.join(pluginRoot, 'config', 'incentive_config.yaml.example')
/** 白名单模板（git 已追踪） */
const whitelistTemplate = path.join(pluginRoot, 'defSet', 'incentive_config', 'whitelist.yaml')

// ========== 白名单 ==========

/**
 * 读取白名单（文件不存在时从模板创建）
 * @returns {{enabled: boolean, users: string[]}}
 */
function loadWhitelist() {
  try {
    if (!fs.existsSync(whitelistPath)) {
      return createDefaultWhitelist()
    }
    return YAML.parse(fs.readFileSync(whitelistPath, 'utf8')) || { enabled: true, users: [] }
  } catch (e) {
    logger.error('[LinkFlow] 读取白名单失败:', e)
    return { enabled: true, users: [] }
  }
}

/**
 * 从模板创建默认白名单文件（保留注释）
 * @returns {{enabled: boolean, users: string[]}}
 */
function createDefaultWhitelist() {
  let content = 'enabled: true\nusers: []\n'
  try {
    if (fs.existsSync(whitelistTemplate)) {
      content = fs.readFileSync(whitelistTemplate, 'utf8')
    }
  } catch (e) {
    logger.warn('[LinkFlow] 读取白名单模板失败，使用默认:', e)
  }
  content = renderTemplate(content, { whitelist_enabled: 'true' })
  fs.mkdirSync(path.dirname(whitelistPath), { recursive: true })
  fs.writeFileSync(whitelistPath, content, 'utf8')
  return YAML.parse(content) || { enabled: true, users: [] }
}

/**
 * 写入白名单（文本级更新，保留注释）
 * @param {{enabled: boolean, users: string[]}} data
 */
function saveWhitelist(data) {
  const filePath = whitelistPath
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  try {
    if (!fs.existsSync(filePath)) {
      createDefaultWhitelist()
    }

    let content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    let usersLineIdx = -1

    for (let i = 0; i < lines.length; i++) {
      if (/^enabled:/i.test(lines[i]) && !lines[i].trim().startsWith('#')) {
        const indent = lines[i].match(/^(\s*)/)[1]
        lines[i] = `${indent}enabled: ${data.enabled !== false}`
      }
      if (/^users:/i.test(lines[i]) && !lines[i].trim().startsWith('#')) {
        usersLineIdx = i
      }
    }

    const before = usersLineIdx >= 0 ? lines.slice(0, usersLineIdx + 1) : [...lines, 'users:']
    const rest = usersLineIdx >= 0 ? lines.slice(usersLineIdx + 1).filter(l => !/^\s*-\s*"/.test(l)) : []
    const usersYaml = (data.users || []).map(u => `  - "${u}"`)
    const result = [...before, ...usersYaml, ...rest]

    fs.writeFileSync(filePath, result.join('\n'), 'utf8')
  } catch (e) {
    logger.warn('[LinkFlow] 文本更新白名单失败，使用 YAML 回退:', e)
    fs.writeFileSync(filePath, YAML.stringify({
      enabled: data.enabled !== false,
      users: data.users || [],
    }, null, 2), 'utf8')
  }
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
 * @returns {object|null} { links: string[20], notifyGroup: number } 或 null
 */
function loadUserConfig(qq) {
  try {
    const file = userCfgPath(qq)
    if (!fs.existsSync(file)) return null
    return YAML.parse(fs.readFileSync(file, 'utf8')) || null
  } catch (e) {
    logger.error(`[LinkFlow] 读取用户 ${qq} 配置失败:`, e)
    return null
  }
}

/**
 * 确保配置包含 20 个槽位，不足补空串，超长截断
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
 * 写入指定 QQ 的个人配置（文本级更新，保留注释）
 * @param {string|number} qq
 * @param {object} data
 */
function saveUserConfig(qq, data) {
  const filePath = userCfgPath(qq)
  const normalized = normalizeUserConfig(data)

  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    // 更新 notifyGroup
    for (let i = 0; i < lines.length; i++) {
      if (/^notifyGroup:/i.test(lines[i])) {
        const indent = lines[i].match(/^(\s*)/)[1]
        lines[i] = `${indent}notifyGroup: ${normalized.notifyGroup}`
        break
      }
    }

    // 按文件中 `  - "..."` 的行号顺序更新所有槽位
    let slotIdx = 0
    for (let i = 0; i < lines.length && slotIdx < MAX_SLOTS; i++) {
      const match = lines[i].match(/^(\s*-\s*)"(.*)"\s*$/)
      if (match) {
        const url = normalized.links[slotIdx] || ''
        const escaped = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        lines[i] = `${match[1]}"${escaped}"`
        slotIdx++
      }
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  } catch (e) {
    logger.warn('[LinkFlow] 文本更新配置失败，使用 YAML 回退:', e)
    fs.mkdirSync(userCfgDir, { recursive: true })
    fs.writeFileSync(filePath, YAML.stringify(normalized, null, 2), 'utf8')
  }
}

/**
 * 模板变量替换（同 guoba.generateConfig），保留注释
 * @param {string} template
 * @param {object} values
 * @returns {string}
 */
function renderTemplate(template, values) {
  return template.replace(/\${(\w+)}/g, (_, name) =>
    values[name] !== undefined ? String(values[name]) : '',
  )
}

/**
 * 为指定 QQ 创建默认配置（从模板文件复制，${变量} 替换保留注释）
 * @param {string|number} qq
 * @param {number} [notifyGroup]
 * @param {string} [templatePath] - 指定模板路径，不指定则用 userCfgTemplate
 * @returns {object} 创建后的配置
 */
function createDefaultUserConfig(qq, notifyGroup = 0, templatePath = userCfgTemplate) {
  let content = 'links:\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\n  - ""\nnotifyGroup: 0\n'
  try {
    if (templatePath && fs.existsSync(templatePath)) {
      content = fs.readFileSync(templatePath, 'utf8')
    }
  } catch (e) {
    logger.warn('[LinkFlow] 读取配置模板失败，使用默认:', e)
  }

  content = renderTemplate(content, { notifyGroup: notifyGroup || 0 })

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
