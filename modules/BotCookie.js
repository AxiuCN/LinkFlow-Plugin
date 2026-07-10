/**
 * Bot Cookie 全生命周期管理
 *
 * 职责：
 * - QR 扫码登录 → bot cookie
 * - 临时设备 Cookie 生成（_uuid、buvid3/4、b_lsid、buvid_fp、b_nut）
 * - Gateway ExClimbWuzhi 风控激活
 * - 存储到 data/bot.json + Redis 备份
 * - 登出清理
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import fetch from 'node-fetch'
import { getBiliTicket } from '../model/BiliTicket.js'
import { genBuvidFp, buildFingerprintData } from '../model/BiliFingerprint.js'
import {
  pluginData,
  QRCODE_GENERATE_URL,
  QRCODE_POLL_URL,
  LOGOUT_URL,
  FINGER_SPI_URL,
  NAV_URL,
  GATEWAY_EXCLIMB_URL,
  CHROME_USER_AGENT,
  LOGIN_POLL_INTERVAL_SECONDS,
  LOGIN_POLL_TIMEOUT_SECONDS,
  REDIS_PREFIX_BOT_COOKIE,
  REDIS_PREFIX_WBI_KEY,
} from '../components/constants.js'

/** Bot Cookie 文件路径 */
const BOT_COOKIE_FILE = path.join(pluginData, 'bot.json')

// ========== 基础工具 ==========

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * 从 fetch Response 提取 set-cookie 到 cookies 对象
 * 兼容 node-fetch v2 (headers.raw) 和 v3 (headers.getSetCookie)
 */
function mergeCookies(cookies, response) {
  let values = []
  if (typeof response.headers.getSetCookie === 'function') {
    values = response.headers.getSetCookie()
  } else if (typeof response.headers.raw === 'function') {
    values = response.headers.raw()['set-cookie'] || []
  } else {
    const v = response.headers.get('set-cookie')
    if (v) values = [v]
  }
  for (const header of values) {
    const match = header.match(/^([^=]+)=([^;]+)/)
    if (match) cookies[match[1]] = match[2]
  }
}

// ========== 临时设备 Cookie 生成 ==========

/** 生成 _uuid 格式：8-4-4-4-12 + Date.now()%100000(5位补零) + infoc */
function genUUID() {
  const seg = (len) => Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const ts = String(Date.now() % 100000).padStart(5, '0')
  return `_uuid=${seg(8)}-${seg(4)}-${seg(4)}-${seg(4)}-${seg(12)}${ts}infoc`
}

/** 生成 b_lsid: 8位随机hex + 时间戳hex(大写) */
function genBLsid() {
  const rand = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `b_lsid=${rand}_${Date.now().toString(16).toUpperCase()}`
}

/** 生成 b_nut: 当前秒级时间戳 */
function genBNut() {
  return `b_nut=${Math.floor(Date.now() / 1000)}`
}

/**
 * 通过 _uuid 获取 buvid3 和 buvid4
 * API: GET /x/frontend/finger/spi
 * @param {string} uuidCookie - 完整的 _uuid cookie 字符串
 * @returns {Promise<string>} "buvid3=xxx;buvid4=xxx"
 */
async function getBuvid3And4(uuidCookie) {
  const res = await fetch(FINGER_SPI_URL, {
    headers: {
      'User-Agent': CHROME_USER_AGENT,
      Cookie: uuidCookie,
    },
  })
  const payload = await res.json()
  const d = payload?.data || {}
  if (!d.b_3 || !d.b_4) {
    logger?.warn('[LinkFlow] getBuvid3_4 返回数据不完整:', JSON.stringify(d))
  }
  return `buvid3=${d.b_3 || ''};buvid4=${d.b_4 || ''}`
}

/**
 * 生成完整临时 Cookie 字符串
 * 包含: _uuid, buvid3, buvid4, b_lsid, buvid_fp, b_nut
 * @returns {Promise<string>}
 */
async function genTempCookies() {
  const uuid = genUUID()
  const buvid = await getBuvid3And4(uuid)
  const blsid = genBLsid()
  const bnut = genBNut()
  const uuidVal = uuid.replace('_uuid=', '')
  const fp = genBuvidFp(uuidVal)
  return `${uuid}; ${buvid}; ${blsid}; buvid_fp=${fp}; ${bnut}`
}

// ========== Gateway 激活 ==========

/**
 * 向 ExClimbWuzhi 网关发送浏览器指纹数据，激活 Cookie
 * @param {string} cookieStr - 完整 cookie 字符串
 * @returns {Promise<void>}
 */
async function postGateway(cookieStr) {
  // 提取 _uuid
  const uuidMatch = cookieStr.match(/_uuid=([^;]+)/)
  const uuidVal = uuidMatch ? uuidMatch[1] : ''
  const fpData = buildFingerprintData(uuidVal)

  const browserData = {
    '3064': 1,
    '5062': String(Date.now()),
    '03bf': 'https://www.bilibili.com/',
    '39c8': '333.999.fp.risk',
    '34f1': '',
    'd402': '',
    '654a': '',
    '6e7c': '878x1066',
    '3c43': {
      '2673': fpData.hasLiedResolution ? 1 : 0,
      '5766': fpData.colorDepth,
      '6527': fpData.addBehavior ? 1 : 0,
      '7003': fpData.indexedDb ? 1 : 0,
      '807e': 1,
      'b8ce': fpData.userAgent,
      '641c': fpData.webdriver ? 1 : 0,
      '07a4': fpData.language,
      '1c57': fpData.deviceMemory,
      '0bd0': fpData.hardwareConcurrency,
      '748e': [1920, 1200],
      'd61f': [1920, 1152],
      'fc9d': fpData.timezoneOffset,
      '6aa9': fpData.timezone,
      '75b8': fpData.sessionStorage ? 1 : 0,
      '3b21': fpData.localStorage ? 1 : 0,
      '8a1c': fpData.openDatabase ? 1 : 0,
      'd52f': fpData.cpuClass,
      'adca': fpData.platform,
      '80c9': fpData.plugins.map(p => p.name),
      '13ab': fpData.canvas,
      'bfe9': fpData.webgl,
      'a3c1': [
        37445, 37446, 37447, 37448, 37449, 37450, 37451, 37452, 37453,
        7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 34768, 34769,
        35760, 35761, 35762, 35763, 35764, 35765, 35766, 35767, 35768,
        35769, 35770, 35771, 35772, 35773, 35774, 35775, 35776, 35777,
        35778, 35779, 35780, 35781, 35782, 35783, 35784, 35785, 35786,
        35787, 35788, 35789, 35790, 35791, 35792, 35793, 35794, 35795,
        35796,
      ],
      '6bc5': fpData.webglVendorAndRenderer,
      'ed31': 0,
      '72bd': 0,
      '097b': 0,
      '52cd': [0, 0, 0],
      'a658': fpData.fonts,
      'd02f': fpData.audio,
    },
    '54ef': {
      'in_new_ab ': true,
      'ab_version ': { 'waterfall_article ': 'SHOW ' },
      'ab_split_num ': { 'waterfall_article ': 0 },
    },
    '8b94': '',
    'df35': uuidVal,
    '07a4': 'zh-CN',
    '5f45': null,
    'db46': 0,
  }

  try {
    await fetch(GATEWAY_EXCLIMB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'User-Agent': CHROME_USER_AGENT,
        Host: 'api.bilibili.com',
        Origin: 'https://www.bilibili.com',
        Referer: 'https://www.bilibili.com/',
      },
      body: JSON.stringify({ payload: JSON.stringify(browserData) }),
    })
    logger?.info('[LinkFlow] Gateway 激活完成')
  } catch (e) {
    logger?.warn('[LinkFlow] Gateway 激活失败:', e.message)
  }
}

// ========== 读写 Bot Cookie 存储 ==========

/**
 * 从 data/bot.json 加载 Cookie
 * @returns {object|null}
 */
function loadBotCookies() {
  try {
    if (!fs.existsSync(BOT_COOKIE_FILE)) return null
    const raw = fs.readFileSync(BOT_COOKIE_FILE, 'utf8')
    const payload = JSON.parse(raw)
    return payload?.cookies || null
  } catch (e) {
    logger?.error('[LinkFlow] 读取 bot Cookie 失败:', e)
    return null
  }
}

/**
 * 保存 Cookie 到 data/bot.json + Redis
 * @param {object} cookies
 */
async function saveBotCookies(cookies) {
  const dir = path.dirname(BOT_COOKIE_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const payload = {
    saved_at: new Date().toLocaleString('zh-CN', { hour12: false }),
    cookies,
  }
  fs.writeFileSync(BOT_COOKIE_FILE, JSON.stringify(payload, null, 2), 'utf8')

  // Redis 热备份 (30 天)
  try {
    await redis.set(REDIS_PREFIX_BOT_COOKIE, JSON.stringify(cookies), { EX: 30 * 24 * 3600 })
  } catch (e) {
    logger?.warn('[LinkFlow] Redis 备份 bot Cookie 失败:', e)
  }

  logger?.info('[LinkFlow] Bot Cookie 已保存')
}

/**
 * 从 bot.json 或 Redis 加载 Cookie 字符串
 * 返回后的 cookieStr 可直接用于 fetch headers
 * @returns {Promise<string|null>}
 */
async function getBotCookieString() {
  let cookies = loadBotCookies()

  // bot.json 不存在时尝试 Redis
  if (!cookies) {
    try {
      const raw = await redis.get(REDIS_PREFIX_BOT_COOKIE)
      if (raw) cookies = JSON.parse(raw)
    } catch {}
  }

  if (!cookies?.SESSDATA) return null
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

/**
 * 读取 bot Cookie 的 CSRF token (bili_jct)
 * @returns {string}
 */
function getBotCsrf() {
  const cookies = loadBotCookies()
  return cookies?.bili_jct || ''
}

// ========== 登录 / 登出 ==========

/**
 * 生成登录二维码并返回 qrcode_key 和 url
 * @returns {Promise<{url: string, qrcode_key: string, initCookies: object}>}
 */
async function generateQRCode() {
  const res = await fetch(`${QRCODE_GENERATE_URL}?source=main-fe-header`, {
    headers: {
      'User-Agent': CHROME_USER_AGENT,
      Accept: '*/*',
      'Accept-Language': 'zh-CN,en-US;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      DNT: '1',
      'Sec-GPC': '1',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'TE': 'trailers',
    },
  })

  const payload = await res.json()
  if (payload?.code !== 0) {
    throw new Error(`获取登录二维码失败: ${payload?.message || payload?.code}`)
  }

  const data = payload?.data || {}
  const initCookies = {}
  mergeCookies(initCookies, res)

  return {
    url: data.url,
    qrcode_key: data.qrcode_key,
    initCookies,
  }
}

/**
 * 轮询扫码结果，返回完整登录 Cookie
 * @param {string} qrcodeKey
 * @param {object} initCookies - 初始 cookie（含 buvid3 等）
 * @param {number} [timeout=180] 超时秒数
 * @param {Function} [onScanned] 扫码成功回调
 * @returns {Promise<object>} 完整 cookies
 */
async function pollQRCode(qrcodeKey, initCookies = {}, timeout = 180, onScanned = null) {
  const cookies = { ...initCookies }
  const deadline = Date.now() + timeout * 1000

  while (Date.now() < deadline) {
    const res = await fetch(`${QRCODE_POLL_URL}?qrcode_key=${qrcodeKey}&source=main-fe-header`, {
      headers: {
        'User-Agent': CHROME_USER_AGENT,
        Referer: 'https://www.bilibili.com/',
        Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      },
    })

    const payload = await res.json()
    const data = payload?.data || {}
    const code = data.code
    mergeCookies(cookies, res)

    if (code === 0) {
      // 扫码成功：解析 DedeUserID 等扩展数据
      if (data.url) {
        try {
          const qs = new URL(data.url)
          qs.searchParams.forEach((v, k) => { if (!cookies[k]) cookies[k] = v })
        } catch {}
      }
      return cookies
    }

    if (code === 86038) {
      throw new Error('二维码已过期，请重新发送 #机器人B站登录')
    }

    // 86101: 未扫码，86090: 已扫码未确认
    if (code === 86090 && onScanned) {
      onScanned()
    }

    await sleep(LOGIN_POLL_INTERVAL_SECONDS * 1000)
  }

  throw new Error('扫码登录超时，请重新发送 #机器人B站登录')
}

/**
 * 执行完整登录流程
 * @param {Function} onQR - 收到二维码 URL 后的回调（传入 url，由调用方渲染图片）
 * @param {Function} [onScanned] - 扫码成功回调
 * @param {number} [timeout=180] 超时秒数
 * @returns {Promise<object>} 最终 cookies
 */
async function botLogin(onQR, onScanned = null, timeout = 180) {
  // Step 1: 获取二维码
  const { url, qrcode_key, initCookies } = await generateQRCode()

  // 通知调用方
  if (onQR) await onQR(url)

  // Step 2: 轮询
  const pollCookies = await pollQRCode(qrcode_key, initCookies, timeout, onScanned)

  // Step 3: 生成临时设备 Cookie
  const tempCkStr = await genTempCookies()

  // Step 4: 合并所有 cookie（pollCookies 为主，tempCk 补充缺字段）
  const merged = { ...pollCookies }
  tempCkStr.split(';').forEach(pair => {
    const m = pair.trim().match(/^([^=]+)=(.+)$/)
    if (m && !merged[m[1]]) {
      merged[m[1]] = m[2]
    }
  })

  // Step 5: 获取 bili_ticket
  try {
    const ticket = await getBiliTicket(merged.bili_jct || '')
    merged.bili_ticket = ticket.ticket
  } catch (e) {
    logger?.warn('[LinkFlow] bili_ticket 获取失败:', e.message)
  }

  // Step 6: Gateway 激活
  const ckStr = Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ')
  await postGateway(ckStr)

  // Step 7: 验证登录
  const navRes = await fetch(NAV_URL, {
    headers: {
      'User-Agent': CHROME_USER_AGENT,
      Referer: 'https://www.bilibili.com/',
      Cookie: ckStr,
    },
  })
  const navPayload = await navRes.json()
  if (!navPayload?.data?.isLogin) {
    throw new Error('登录验证失败：Cookie 无效')
  }

  logger?.info(`[LinkFlow] Bot B站登录成功: ${navPayload.data.uname} (UID: ${navPayload.data.mid})`)

  // Step 8: 持久化保存
  await saveBotCookies(merged)

  return merged
}

/**
 * 登出并清理 Cookie
 */
async function botLogout() {
  const cookies = loadBotCookies()
  if (!cookies?.bili_jct) {
    logger?.info('[LinkFlow] Bot 登出：无 Cookie 可清理')
  } else {
    const ckStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')

    try {
      await fetch(LOGOUT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': CHROME_USER_AGENT,
          Cookie: ckStr,
        },
        body: `biliCSRF=${cookies.bili_jct}`,
      })
    } catch {}
  }

  // 清理文件
  try {
    if (fs.existsSync(BOT_COOKIE_FILE)) fs.unlinkSync(BOT_COOKIE_FILE)
  } catch {}

  // 清理 Redis
  try {
    await redis.del(REDIS_PREFIX_BOT_COOKIE)
    await redis.del(REDIS_PREFIX_WBI_KEY)
  } catch {}

  logger?.info('[LinkFlow] Bot B站已登出')
}

/**
 * 查询 Bot 登录状态
 * @returns {Promise<{isLogin: boolean, uname?: string, mid?: number}>}
 */
async function botStatus() {
  const cookieStr = await getBotCookieString()
  if (!cookieStr) return { isLogin: false }

  try {
    const res = await fetch(NAV_URL, {
      headers: {
        'User-Agent': CHROME_USER_AGENT,
        Referer: 'https://www.bilibili.com/',
        Cookie: cookieStr,
      },
    })
    const payload = await res.json()
    if (payload?.data?.isLogin) {
      return {
        isLogin: true,
        uname: payload.data.uname,
        mid: payload.data.mid,
      }
    }
  } catch {}

  return { isLogin: false }
}

export { botLogin, botLogout, botStatus, getBotCookieString, getBotCsrf, genTempCookies, postGateway, loadBotCookies }
