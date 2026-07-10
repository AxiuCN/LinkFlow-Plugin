import { createHmac } from 'node:crypto'
import fetch from 'node-fetch'
import { GEN_WEB_TICKET_URL, CHROME_USER_AGENT } from '../components/constants.js'

/** HMAC-SHA256 签名的固定 key，不可修改 */
const TICKET_KEY = 'XgwSnGZ1p'

/**
 * HMAC-SHA256 签名
 * @param {string} key
 * @param {string} message
 * @returns {string} 十六进制签名字符串
 */
function hmacSha256(key, message) {
  return createHmac('sha256', key).update(message).digest('hex')
}

/**
 * 生成 bili_ticket（B站风控凭证）
 * 算法：HMAC-SHA256('XgwSnGZ1p', 'ts{unix_ts}') → hexsign
 *
 * @param {string} [csrf=''] bili_jct 值，可选
 * @returns {Promise<{ticket: string, created_at: number, ttl: number}>}
 */
export async function getBiliTicket(csrf = '') {
  const ts = Math.floor(Date.now() / 1000)
  const hexSign = hmacSha256(TICKET_KEY, `ts${ts}`)

  const params = new URLSearchParams({
    key_id: 'ec02',
    hexsign: hexSign,
    'context[ts]': String(ts),
    csrf,
  })

  const res = await fetch(`${GEN_WEB_TICKET_URL}?${params}`, {
    method: 'POST',
    headers: { 'User-Agent': CHROME_USER_AGENT },
  })

  const payload = await res.json()
  if (payload?.code !== 0) {
    throw new Error(`[BiliTicket] 获取失败: code=${payload?.code}, msg=${payload?.message || ''}`)
  }

  const data = payload?.data || {}
  return {
    ticket: data.ticket,
    created_at: data.created_at,
    ttl: data.ttl,
  }
}
