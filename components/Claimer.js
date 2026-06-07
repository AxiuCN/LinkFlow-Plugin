import { BiliClient, BiliCookieInvalidError } from './BiliClient.js'
import { loadAccountCookies, saveAccountCookies } from './Storage.js'
import { getPluginConfig } from './config.js'
import { startLogin } from './BiliLogin.js'

/**
 * 为指定 QQ 创建 BiliClient 实例
 * @param {string|number} qq
 * @param {object} [opts]
 * @returns {Promise<BiliClient|null>}
 */
async function createClient(qq, opts = {}) {
  const cookies = loadAccountCookies(qq)
  if (!cookies) return null
  const config = getPluginConfig()
  const timeout = opts.timeout || config?.incentive?.claim?.timeout || 10
  return new BiliClient(cookies, timeout)
}

/**
 * 为指定 QQ 执行登录并保存 Cookie
 * @param {string|number} qq
 * @param {object} [opts] 同 startLogin 的 opts
 * @returns {Promise<BiliClient>}
 */
async function doLogin(qq, opts = {}) {
  const cookies = await startLogin(opts)
  saveAccountCookies(qq, cookies)
  const config = getPluginConfig()
  return new BiliClient(cookies, config?.incentive?.claim?.timeout || 10)
}

/**
 * 对指定 QQ 执行一个 taskId 的抢奖励流程
 * @param {string} taskId
 * @param {string|number} qq
 * @param {object} [cancelSignal]
 * @param {Function} [logCb] — 每次请求的回调 (msg)，用于文件日志
 * @param {object} [awardInfo] — 可选，预获取的任务信息，若提供则跳过内部 getAwardInfo
 * @returns {Promise<{cdkey: string, awardInfo: object}>}
 */
async function doClaim(taskId, qq, cancelSignal, logCb = null, awardInfo = null) {
  const config = getPluginConfig()
  const claimCfg = config?.incentive?.claim || {}

  const client = await createClient(qq)
  if (!client) {
    throw new Error('您尚未绑定B站账号，请先发送 #B站登录')
  }

  try {
    await client.ensureLoggedIn()
  } catch (e) {
    if (e instanceof BiliCookieInvalidError) {
      throw new Error('B站登录已失效，请重新发送 #B站登录')
    }
    throw e
  }

  if (!awardInfo) {
    awardInfo = await client.getAwardInfo(taskId, logCb)
  }

  const cdkey = await client.claimAward(taskId, awardInfo, {
    threadCount: Math.max(1, claimCfg.threadCount || 2),
    maxRetry: 30,
    retryInterval: claimCfg.retryInterval || 1.0,
    cancelSignal,
    logCb,
  })

  return { cdkey, awardInfo }
}

export { createClient, doLogin, doClaim }
