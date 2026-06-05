import fetch from 'node-fetch'
import {
  QRCODE_GENERATE_URL,
  QRCODE_POLL_URL,
  DEFAULT_USER_AGENT,
  LOGIN_POLL_TIMEOUT_SECONDS,
  LOGIN_POLL_INTERVAL_SECONDS,
} from './constants.js'

/**
 * 从 fetch Response 中提取 set-cookie 到 cookies 对象
 * 兼容 node-fetch v2（raw）和 v3（getSetCookie）
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

/**
 * 发起扫码登录流程，静默轮询，返回 cookies
 * @param {object} [opts]
 * @param {number} [opts.timeout] 轮询超时秒数
 * @param {Function} [opts.onQR] 收到二维码 url 的回调，用于渲染图片
 * @returns {Promise<object>} cookies 对象
 */
async function startLogin(opts = {}) {
  const timeout = opts.timeout || LOGIN_POLL_TIMEOUT_SECONDS

  // Step 1: 获取二维码
  const genRes = await fetch(QRCODE_GENERATE_URL, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Referer: 'https://www.bilibili.com/' },
  })
  const genPayload = await genRes.json()
  if (genPayload?.code !== 0) {
    throw new Error(`获取登录二维码失败: ${genPayload?.message || genPayload?.code}`)
  }
  const data = genPayload?.data || {}
  const url = data.url
  const qrcodeKey = data.qrcode_key
  if (!url || !qrcodeKey) throw new Error('登录二维码返回内容不完整')

  // 初始 cookies
  const cookies = {}
  mergeCookies(cookies, genRes)

  // 通知调用者二维码 URL（用于渲染美化图片）
  if (opts.onQR) await opts.onQR(url)

  // Step 2: 静默轮询（不发送中间状态消息）
  const deadline = Date.now() + timeout * 1000
  while (Date.now() < deadline) {
    const pollRes = await fetch(`${QRCODE_POLL_URL}?qrcode_key=${qrcodeKey}`, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Referer: 'https://www.bilibili.com/',
        Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      },
    })
    const pollPayload = await pollRes.json()
    const pollData = pollPayload?.data || {}
    const code = pollData.code
    mergeCookies(cookies, pollRes)

    // 扫码成功
    if (code === 0) {
      if (pollData.url) {
        const qs = new URL(pollData.url)
        qs.searchParams.forEach((v, k) => { if (!cookies[k]) cookies[k] = v })
      }
      return cookies
    }
    // 二维码过期
    if (code === 86038) {
      throw new Error('二维码已过期，请重新发送 #B站登录')
    }

    await new Promise(r => setTimeout(r, LOGIN_POLL_INTERVAL_SECONDS * 1000))
  }

  throw new Error('扫码登录超时，请重新发送 #B站登录')
}

export { startLogin }
