import fetch from 'node-fetch'
import { signWbi, loadBotCookies, formatCookiesText } from './auth.js'
import {
  VIDEO_INFO_URL,
  USER_INFO_URL,
  SEARCH_URL,
  DEFAULT_USER_AGENT,
} from '../../components/constants.js'

/**
 * 获取公共请求头（bot Cookie 优先）
 */
function getHeaders() {
  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    Referer: 'https://www.bilibili.com/',
  }
  const botCk = loadBotCookies()
  if (botCk) {
    headers.Cookie = formatCookiesText(botCk)
  }
  return headers
}

/**
 * 获取视频信息（含分P、互动数据）
 * @param {string} bvid - BV 号
 * @returns {Promise<object|null>}
 */
async function getVideoInfo(bvid) {
  try {
    const query = await signWbi({ bvid }, loadBotCookies())
    const res = await fetch(`${VIDEO_INFO_URL}?${query}`, { headers: getHeaders() })
    const payload = await res.json()
    if (payload?.code !== 0) return null
    const d = payload.data || {}
    return {
      bvid: d.bvid,
      aid: d.aid,
      title: d.title,
      desc: d.desc,
      cover: d.pic,
      duration: d.duration,
      durationText: formatDuration(d.duration),
      owner: d.owner ? { uid: String(d.owner.mid), name: d.owner.name, face: d.owner.face } : null,
      stat: d.stat ? { view: d.stat.view, danmaku: d.stat.danmaku, reply: d.stat.reply, favorite: d.stat.favorite, like: d.stat.like } : null,
      pages: (d.pages || []).map(p => ({ page: p.page, title: p.part, duration: p.duration, cid: p.cid })),
      pubdate: d.pubdate,
      tname: d.tname,
    }
  } catch (e) {
    logger?.error('[LinkFlow] getVideoInfo 异常:', e)
    return null
  }
}

/**
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 获取 UP 主信息
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
async function getUserInfo(uid) {
  try {
    const query = await signWbi({ mid: uid }, loadBotCookies())
    const res = await fetch(`${USER_INFO_URL}?${query}`, { headers: getHeaders() })
    const payload = await res.json()
    if (payload?.code !== 0) return null
    const d = payload.data || {}
    return {
      uid: String(d.mid),
      name: d.name,
      face: d.face,
      sign: d.sign,
      level: d.level,
      fans: d.fans,
      liveRoomId: d.live_room?.roomid || null,
    }
  } catch (e) {
    logger?.error('[LinkFlow] getUserInfo 异常:', e)
    return null
  }
}

/**
 * 搜索视频
 * @param {string} keyword
 * @param {number} [page=1]
 * @param {number} [pageSize=5]
 * @returns {Promise<object|null>}
 */
async function searchVideo(keyword, page = 1, pageSize = 5) {
  try {
    const query = await signWbi({
      keyword,
      search_type: 'video',
      page: String(page),
      page_size: String(pageSize),
    }, loadBotCookies())
    const res = await fetch(`${SEARCH_URL}?${query}`, { headers: getHeaders() })
    const payload = await res.json()
    if (payload?.code !== 0) return null
    const d = payload.data || {}
    return {
      numResults: d.numResults,
      numPages: d.numPages,
      items: (d.result || []).map(v => ({
        bvid: v.bvid,
        aid: v.aid,
        title: v.title.replace(/<[^>]+>/g, ''),
        author: v.author,
        mid: v.mid,
        duration: v.duration,
        cover: v.pic,
        play: v.play,
        danmaku: v.danmaku,
      })),
    }
  } catch (e) {
    logger?.error('[LinkFlow] searchVideo 异常:', e)
    return null
  }
}

export { getVideoInfo, getUserInfo, searchVideo }
