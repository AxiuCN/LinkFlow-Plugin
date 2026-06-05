import fs from 'node:fs'
import path from 'node:path'
import { pluginData } from './constants.js'

// ========== 按 QQ 存储 Cookie ==========

const accountsDir = path.join(pluginData, 'accounts')

/**
 * 获取指定 QQ 的 Cookie 文件路径
 * @param {string|number} qq
 * @returns {string}
 */
function accountPath(qq) {
  return path.join(accountsDir, `${qq}.json`)
}

/**
 * 校验 Cookie 是否包含必要字段
 * @param {object|null} cookies
 * @returns {boolean}
 */
function validateCookies(cookies) {
  return !!(cookies && typeof cookies === 'object' && cookies.SESSDATA && cookies.bili_jct)
}

/**
 * 加载指定 QQ 的 Cookie
 * @param {string|number} qq
 * @returns {object|null} { SESSDATA, bili_jct, ... } 或 null
 */
function loadAccountCookies(qq) {
  try {
    const file = accountPath(qq)
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file, 'utf8')
    const payload = JSON.parse(raw)
    const cookies = payload?.cookies
    return validateCookies(cookies) ? cookies : null
  } catch (e) {
    logger.error('[Bilibili-Plugin] 读取Cookie失败:', e)
    return null
  }
}

/**
 * 保存指定 QQ 的 Cookie
 * @param {string|number} qq
 * @param {object} cookies
 */
function saveAccountCookies(qq, cookies) {
  if (!validateCookies(cookies)) {
    throw new Error('[Bilibili-Plugin] Cookie 缺少关键字段: SESSDATA 或 bili_jct')
  }
  fs.mkdirSync(accountsDir, { recursive: true })
  const payload = {
    saved_at: new Date().toLocaleString('zh-CN', { hour12: false }),
    cookies,
  }
  fs.writeFileSync(accountPath(qq), JSON.stringify(payload, null, 2), 'utf8')
  logger.info(`[Bilibili-Plugin] QQ ${qq} 的 Cookie 已保存`)
}

/**
 * 列出所有已绑定 Cookie 的 QQ
 * @returns {string[]}
 */
function listBoundAccounts() {
  try {
    if (!fs.existsSync(accountsDir)) return []
    return fs.readdirSync(accountsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch (e) {
    logger.error('[Bilibili-Plugin] 列出绑定账号失败:', e)
    return []
  }
}

// ========== 活动链接管理 ==========

const linksFile = path.join(pluginData, 'links.json')

function loadLinks() {
  try {
    if (!fs.existsSync(linksFile)) return []
    const raw = fs.readFileSync(linksFile, 'utf8')
    const payload = JSON.parse(raw)
    return Array.isArray(payload?.links) ? payload.links : []
  } catch (e) {
    logger.error('[Bilibili-Plugin] 读取链接列表失败:', e)
    return []
  }
}

function saveLinks(links) {
  fs.mkdirSync(pluginData, { recursive: true })
  fs.writeFileSync(linksFile, JSON.stringify({ links }, null, 2), 'utf8')
}

function addLink(item) {
  const links = loadLinks()
  if (links.some(l => l.task_id === item.task_id)) return null
  const maxId = links.reduce((max, l) => Math.max(max, l.id || 0), 0)
  const link = { id: maxId + 1, task_id: item.task_id, url: item.url, added_at: new Date().toLocaleString('zh-CN', { hour12: false }) }
  links.push(link)
  saveLinks(links)
  return link
}

function removeLink(id) {
  const links = loadLinks()
  const idx = links.findIndex(l => l.id === id)
  if (idx === -1) return null
  const [removed] = links.splice(idx, 1)
  saveLinks(links)
  return removed
}

export { loadAccountCookies, saveAccountCookies, listBoundAccounts, validateCookies, loadLinks, addLink, removeLink }
