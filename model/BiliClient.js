import fetch from 'node-fetch'
import crypto from 'crypto'
import {
  NAV_URL,
  MISSION_INFO_URL,
  MISSION_RECEIVE_URL,
  FEED_SPACE_URL,
  SPACE_ACC_INFO_URL,
  DEFAULT_USER_AGENT,
  CHROME_USER_AGENT,
  WEB_LOCATION,
  DYNAMIC_WEB_LOCATION,
  MISSION_INFO_RETRY_SECONDS,
  MISSION_INFO_RETRY_INTERVAL,
  MIXIN_KEY_ENC_TAB,
  DM_IMG_LIST,
  DM_IMG_STR,
  DM_COVER_IMG_STR,
  DM_IMG_INTER,
} from '../components/constants.js'

/** Cookie 失效错误 */
class BiliCookieInvalidError extends Error {
  constructor(msg) { super(msg); this.name = 'BiliCookieInvalidError' }
}

/** 奖励已取消 */
class BiliRewardCancelledError extends Error {
  constructor(msg) { super(msg); this.name = 'BiliRewardCancelledError' }
}

/**
 * 将 cookies 对象转为 Cookie 请求头字符串
 */
function formatCookiesText(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * B站 API 客户端
 * 封装请求、WBI 签名、登录态管理
 */
class BiliClient {
  /**
   * @param {object} cookies — 必须含 SESSDATA、bili_jct
   * @param {number} [timeout=10] 请求超时秒数
   * @param {boolean} [useBotCookie=false] — true 时忽略 cookies 参数，从 BotCookie 加载
   */
  constructor(cookies, timeout = 10, useBotCookie = false) {
    this._useBotCookie = useBotCookie
    if (useBotCookie) {
      this.cookies = null      // 延迟加载，调用 _resolveCookies() 时再读
      this._cookieStr = null
    } else {
      this.cookies = cookies
      this._cookieStr = null
    }
    this.timeout = timeout * 1000
    this._wbiKeys = null
    this._userAgent = useBotCookie ? CHROME_USER_AGENT : DEFAULT_USER_AGENT
  }

  /** 解析最终 cookies 对象和 cookie 字符串（bot 模式延迟加载） */
  async _resolveCookies() {
    if (this._cookieStr) return { cookies: this.cookies, str: this._cookieStr }
    if (this._useBotCookie) {
      const { getBotCookieString } = await import('../modules/BotCookie.js')
      const str = await getBotCookieString()
      if (!str) throw new BiliCookieInvalidError('[Cookie] Bot B站未登录')
      // 解析为 cookies 对象
      const obj = {}
      str.split(';').forEach(p => {
        const m = p.trim().match(/^([^=]+)=(.+)$/)
        if (m) obj[m[1]] = m[2]
      })
      this.cookies = obj
      this._cookieStr = str
    }
    return { cookies: this.cookies, str: this._cookieStr || formatCookiesText(this.cookies) }
  }

  get cookieHeader() {
    return this._cookieStr || formatCookiesText(this.cookies)
  }

  // ========== 底层请求 ==========

  async _get(url, headers = {}) {
    const { str: cookieStr } = await this._resolveCookies()
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': this._userAgent,
        Referer: 'https://www.bilibili.com/',
        Cookie: cookieStr || this.cookieHeader,
        ...headers,
      },
      signal: AbortSignal.timeout(this.timeout),
    })
    return res.json()
  }

  async _post(url, body, headers = {}) {
    const { str: cookieStr } = await this._resolveCookies()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': this._userAgent,
        Referer: 'https://www.bilibili.com/',
        Cookie: cookieStr || this.cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(this.timeout),
    })
    return res.json()
  }

  // ========== WBI 签名 ==========

  async _getWbiKeys() {
    if (this._wbiKeys) return this._wbiKeys
    const payload = await this._get(NAV_URL)
    const data = payload?.data || {}
    const wbiImg = data.wbi_img || {}
    const imgUrl = wbiImg.img_url
    const subUrl = wbiImg.sub_url
    if (!imgUrl || !subUrl) {
      throw new Error('[BiliClient] 获取 WBI 密钥失败')
    }
    const imgKey = imgUrl.split('/').pop().split('.')[0]
    const subKey = subUrl.split('/').pop().split('.')[0]
    this._wbiKeys = { img_key: imgKey, sub_key: subKey }
    return this._wbiKeys
  }

  /**
   * 计算 WBI 签名查询串
   * @param {object} [params={}]
   * @returns {Promise<string>} 含 w_rid 的查询串
   */
  async getWebSign(params = {}) {
    const { img_key, sub_key } = await this._getWbiKeys()
    const mixinSource = img_key + sub_key
    const mixinKey = MIXIN_KEY_ENC_TAB.map(i => mixinSource[i]).join('').slice(0, 32)

    const raw = { ...params, wts: Math.floor(Date.now() / 1000).toString() }
    const sorted = {}
    Object.keys(raw).sort().forEach(k => {
      sorted[k] = raw[k].replace(/[!'()*]/g, '')
    })
    const query = new URLSearchParams(sorted).toString()
    const wRid = crypto.createHash('md5').update(query + mixinKey).digest('hex')
    sorted.w_rid = wRid
    return new URLSearchParams(sorted).toString()
  }

  // ========== 登录态 ==========

  getCsrf() {
    return this.cookies.bili_jct || ''
  }

  async ensureLoggedIn() {
    const payload = await this._get(NAV_URL)
    if (!payload?.data?.isLogin) {
      throw new BiliCookieInvalidError('[Cookie] 当前登录态无效')
    }
  }

  // ========== 奖励查询 ==========

  /**
   * 查询任务/奖励信息（-702 时重试）
   * @param {string} taskId
   * @param {Function} [logCb]
   * @returns {Promise<{act_id:string, act_name:string, task_name:string, award_name:string}>}
   */
  async getAwardInfo(taskId, logCb = null) {
    const deadline = Date.now() + MISSION_INFO_RETRY_SECONDS * 1000
    let attempt = 0

    while (true) {
      attempt++
      const query = await this.getWebSign({ task_id: taskId, web_location: WEB_LOCATION })
      const payload = await this._get(`${MISSION_INFO_URL}?${query}`)
      const code = payload?.code ?? -1
      const message = payload?.message || ''

      if (code === 0) {
        if (logCb) logCb(`task=${taskId} code=0 getAwardInfo`)
        const data = payload?.data || {}
        const ri = data.reward_info || {}
        const result = {
          act_id: String(data.act_id || ''),
          act_name: String(data.act_name || ''),
          task_name: String(data.task_name || ''),
          task_desc: String(data.task_desc || ''),
          award_name: String(ri.award_name || ''),
        }
        if (!result.act_id || !result.act_name || !result.task_name || !result.award_name) {
          throw new Error('[领取] 奖励信息字段不完整')
        }
        return result
      }

      const errMsg = `task=${taskId} code=${code}, message=${message}`
      if (logCb) logCb(errMsg)
      if (code !== -702 || Date.now() >= deadline) {
        throw new Error(errMsg)
      }
      if (logCb) logCb(`task=${taskId} 重试 attempt=${attempt}`)
      await sleep(MISSION_INFO_RETRY_INTERVAL * 1000)
    }
  }

  // ========== 并发领取 ==========

  /**
   * 并发领取奖励（多 worker 竞争）
   * @param {string} taskId
   * @param {object} awardInfo
   * @param {object} [opts]
   * @returns {Promise<string>} cdkey
   */
  async claimAward(taskId, awardInfo, opts = {}) {
    const {
      threadCount = 2,
      maxRetry = 120,
      retryInterval = 1.0,
      logCb = null,
      cancelSignal = null,
    } = opts

    const form = new URLSearchParams({
      task_id: taskId,
      activity_id: awardInfo.act_id,
      activity_name: awardInfo.act_name,
      task_name: awardInfo.task_name,
      reward_name: awardInfo.award_name,
      gaia_vtoken: '',
      receive_from: 'missionPage',
      csrf: this.getCsrf(),
    }).toString()

    let stop = false
    const errLog = []

    const worker = async (id) => {
      for (let attempt = 1; attempt <= maxRetry; attempt++) {
        if (cancelSignal?.cancelled) throw new BiliRewardCancelledError(`worker-${id} 取消`)
        if (stop) throw new Error(`worker-${id} 已被抢先`)

        try {
          const query = await this.getWebSign()
          const payload = await this._post(`${MISSION_RECEIVE_URL}?${query}`, form)
          const code = payload?.code ?? -1
          const message = payload?.message || ''

          if (code === 0) {
            const cdkey = payload?.data?.extra_info?.cdkey_content || ''
            if (logCb) logCb(`task=${taskId} worker=${id} attempt=${attempt} code=0 success`)
            stop = true
            return cdkey
          }

          if (code === -101 || message.includes('账号未登录')) {
            stop = true
            throw new BiliCookieInvalidError(`Cookie失效: code=${code}`)
          }

          // 终态错误：无需重试，先记录再抛出，避免 Promise.any 时丢失
          if (code === 202031 || code === 202032 || code === 75255 || code === 202129) {
            stop = true
            errLog.push(`w${id}-${attempt}: code=${code} msg=${message}`)
            throw new Error(`终态: code=${code} msg=${message}`)
          }

          if (logCb) logCb(`task=${taskId} worker=${id} attempt=${attempt} code=${code} msg=${message}`)
          errLog.push(`w${id}-${attempt}: code=${code} msg=${message}`)
        } catch (e) {
          if (e instanceof BiliCookieInvalidError || e instanceof BiliRewardCancelledError) throw e
          if (stop) throw e
          if (logCb) logCb(`task=${taskId} worker=${id} attempt=${attempt}: ${e.message}`)
          errLog.push(`w${id}-${attempt}: ${e.message}`)
        }

        if (attempt < maxRetry && !stop) await sleep(retryInterval * 1000)
      }
      throw new Error(`worker-${id} 超过最大重试(${maxRetry})`)
    }

    const workers = Array.from({ length: threadCount }, (_, i) => worker(i + 1))
    try {
      return await Promise.any(workers)
    } catch {
      const last = errLog.slice(-5).join('; ')
      throw new Error(`领取失败: ${last}`)
    }
  }

  // ========== 单次领取（用于兜底任务，不重试）==========

  /**
   * 单次领取请求，不重试，无并发
   * @param {string} taskId
   * @param {object} awardInfo
   * @returns {Promise<{success: boolean, code: number, message: string, cdkey: string}>}
   */
  async tryClaimOnce(taskId, awardInfo) {
    const form = new URLSearchParams({
      task_id: taskId,
      activity_id: awardInfo.act_id,
      activity_name: awardInfo.act_name,
      task_name: awardInfo.task_name,
      reward_name: awardInfo.award_name,
      gaia_vtoken: '',
      receive_from: 'missionPage',
      csrf: this.getCsrf(),
    }).toString()

    const query = await this.getWebSign()
    const payload = await this._post(`${MISSION_RECEIVE_URL}?${query}`, form)
    const code = payload?.code ?? -1
    const message = payload?.message || ''

    if (code === 0) {
      return {
        success: true,
        code: 0,
        message: '',
        cdkey: payload?.data?.extra_info?.cdkey_content || '',
      }
    }

    if (code === -101 || message.includes('账号未登录')) {
      return { success: false, code: -101, message: 'Cookie失效', cdkey: '' }
    }

    return { success: false, code, message, cdkey: '' }
  }

  // ========== 动态订阅相关 ==========

  /**
   * 获取 UP 主动态列表（WBI 签名 + dm_img 反爬参数）
   * API: GET /x/polymer/web-dynamic/v1/feed/space
   * @param {string} uid - UP 主 UID
   * @param {string} [offset=''] - 分页偏移
   * @returns {Promise<object>} API 原始响应
   */
  async getDynamicList(uid, offset = '') {
    await this._resolveCookies()
    const params = {
      host_mid: String(uid),
      offset,
      timezone_offset: '-480',
      platform: 'web',
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,forwardListHidden,ugcDelete,onlyfansQaCard',
      web_location: DYNAMIC_WEB_LOCATION,
      dm_img_list: DM_IMG_LIST,
      dm_img_str: DM_IMG_STR,
      dm_cover_img_str: DM_COVER_IMG_STR,
      dm_img_inter: DM_IMG_INTER,
    }
    const query = await this.getWebSign(params)
    return this._get(`${FEED_SPACE_URL}?${query}`)
  }

  /**
   * 获取 UP 用户信息（昵称、头像）
   * API: GET /x/space/wbi/acc/info (WBI 签名)
   * @param {string} uid - UP 主 UID
   * @returns {Promise<object>} API 原始响应
   */
  async getUserInfo(uid) {
    await this._resolveCookies()
    const query = await this.getWebSign({ mid: String(uid) })
    return this._get(`${SPACE_ACC_INFO_URL}?${query}`)
  }
}

export { BiliClient, BiliCookieInvalidError, BiliRewardCancelledError, formatCookiesText, sleep }
