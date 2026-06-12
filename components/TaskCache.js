import fs from 'node:fs'
import path from 'node:path'
import { pluginData } from './constants.js'

/** 缓存文件路径 */
const cacheFile = path.join(pluginData, 'task_awards.json')

/** 缓存有效期（3 个月） */
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

/**
 * 读取全部缓存
 * @returns {object} taskId → { award_name, act_name, task_name, cached_at }
 */
function loadCache() {
  try {
    if (!fs.existsSync(cacheFile)) return {}
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) || {}
  } catch (e) {
    logger.error('[Bilibili-Plugin] 读取奖励缓存失败:', e)
    return {}
  }
}

/**
 * 写入缓存
 * @param {object} data
 */
function saveCache(data) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    logger.error('[Bilibili-Plugin] 写入奖励缓存失败:', e)
  }
}

/**
 * 获取缓存的奖励信息，过期返回 null
 * @param {string} taskId
 * @returns {object|null}
 */
function getTaskInfo(taskId) {
  const cache = loadCache()
  const entry = cache[taskId]
  if (!entry) return null
  if (!entry.act_id) return null
  const age = Date.now() - new Date(entry.cached_at).getTime()
  if (age > CACHE_TTL_MS) return null
  return entry
}

/**
 * 存入奖励信息
 * @param {string} taskId
 * @param {object} info - { award_name, act_name, task_name }
 */
function setTaskInfo(taskId, info) {
  const cache = loadCache()
  cache[taskId] = {
    act_id: info.act_id || '',
    award_name: info.award_name || '',
    act_name: info.act_name || '',
    task_name: info.task_name || '',
    task_desc: info.task_desc || '',
    cached_at: new Date().toISOString(),
  }
  saveCache(cache)
}

export { getTaskInfo, setTaskInfo, loadCache }
