import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { pluginRoot } from './constants.js'

/** 插件配置路径 */
const configPath = path.join(pluginRoot, 'config', 'config.yaml')

/**
 * 读取插件配置 (config/config.yaml)
 * @returns {object} 解析后的配置对象
 */
function getPluginConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8')
      return YAML.parse(content) || {}
    }
  } catch (e) {
    logger.error('[LinkFlow] 读取配置文件失败:', e)
  }
  return {}
}

/**
 * 从 config/config.yaml 的 dailyTaskLinks 中移除指定链接
 * 文本级编辑，在 dailyTaskLinks: 区域匹配列表项并清空
 * @param {string} url — 要移除的完整链接
 */
function removeDailyTaskLink(url) {
  if (!url) return
  try {
    if (!fs.existsSync(configPath)) return
    const content = fs.readFileSync(configPath, 'utf8')
    const lines = content.split('\n')

    let inDailyTaskLinks = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^\s*dailyTaskLinks:\s*$/.test(line)) {
        inDailyTaskLinks = true
        continue
      }
      if (inDailyTaskLinks) {
        // 遇到非列表项、非空行、非注释行，退出 dailyTaskLinks 区域
        if (!/^\s*-/.test(line) && !/^\s*$/.test(line) && !/^\s*#/.test(line)) {
          break
        }
        if (/^\s*-\s*['"]/.test(line)) {
          const urlMatch = line.match(/['"](.*)['"]/)
          if (urlMatch && urlMatch[1] === url) {
            const indent = line.match(/^(\s*)/)[1]
            lines[i] = `${indent}- ''`
            break
          }
        }
      }
    }

    fs.writeFileSync(configPath, lines.join('\n'), 'utf8')
    logger.info(`[LinkFlow] 已从 dailyTaskLinks 中移除已结束链接: ${url}`)
  } catch (e) {
    logger.error('[LinkFlow] 移除 dailyTaskLink 失败:', e)
  }
}

export { getPluginConfig, configPath, removeDailyTaskLink }
