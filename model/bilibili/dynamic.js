import fetch from 'node-fetch'
import { signWbi, loadBotCookies, formatCookiesText } from './auth.js'
import {
  DYNAMIC_SPACE_URL,
  DEFAULT_USER_AGENT,
} from '../../components/constants.js'

/**
 * 获取指定 UP 主的动态列表
 * @param {string} uid - UP 主 UID
 * @param {object} [opts]
 * @param {string} [opts.offset] - 翻页 offset（dynamic_id_str）
 * @returns {Promise<object|null>} { items: [...], has_more, offset }
 */
async function fetchDynamicFeed(uid, opts = {}) {
  try {
    const params = {
      host_mid: uid,
      platform: 'web',
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssets,forwardListHidden',
    }
    if (opts.offset) params.offset = opts.offset

    const query = await signWbi(params, loadBotCookies())
    const headers = {
      'User-Agent': DEFAULT_USER_AGENT,
      Referer: `https://space.bilibili.com/${uid}/dynamic`,
    }
    const botCk = loadBotCookies()
    if (botCk) {
      headers.Cookie = formatCookiesText(botCk)
    }

    const res = await fetch(`${DYNAMIC_SPACE_URL}?${query}`, { headers })
    const payload = await res.json()
    if (payload?.code !== 0) {
      logger?.warn(`[LinkFlow] fetchDynamicFeed uid=${uid} code=${payload?.code}`)
      return null
    }
    const data = payload.data || {}
    const items = (data.items || []).map(parseDynamicItem).filter(Boolean)
    return {
      items,
      has_more: !!data.has_more,
      offset: data.offset || '',
    }
  } catch (e) {
    logger?.error('[LinkFlow] fetchDynamicFeed 异常:', e)
    return null
  }
}

/**
 * B站动态类型常量
 */
const DYNAMIC_TYPES = {
  DYNAMIC_TYPE_AV: '视频投稿',
  DYNAMIC_TYPE_WORD: '纯文字',
  DYNAMIC_TYPE_DRAW: '图文',
  DYNAMIC_TYPE_ARTICLE: '文章',
  DYNAMIC_TYPE_FORWARD: '转发',
  DYNAMIC_TYPE_LIVE_RCMD: '直播',
}

/**
 * 将B站API原始动态条目解析为统一结构
 * @param {object} item - API 返回的原始条目
 * @returns {object|null}
 */
function parseDynamicItem(item) {
  if (!item) return null
  const type = item.type
  const idStr = item.id_str || ''
  const modules = item.modules || {}
  const author = modules.module_author || {}
  const stat = modules.module_stat || {}

  // 获取 UP 主信息
  const upName = author.name || ''
  const upFace = author.face || ''
  const pubTs = author.pub_ts || 0

  // 基本结构
  const base = {
    id_str: idStr,
    type,
    typeLabel: DYNAMIC_TYPES[type] || '未知',
    upName,
    upFace,
    pubTs,
    viewCount: stat.view?.count || 0,
    likeCount: stat.like?.count || 0,
    commentCount: stat.comment?.count || 0,
    forwardCount: stat.forward?.count || 0,
    text: '',
    pics: [],
    videoBvid: '',
    videoCover: '',
    forwardIdStr: '',
  }

  // 提取文本和媒体内容
  const desc = modules.module_dynamic
  if (desc) {
    // 文本
    const descNode = desc.desc
    if (descNode) {
      base.text = extractRichText(descNode)
    }

    // 主要内容 (major)
    const major = desc.major
    if (major) {
      // 视频投稿
      if (major.type === 'MAJOR_TYPE_ARCHIVE') {
        const archive = major.archive || {}
        base.videoBvid = archive.bvid || ''
        base.videoCover = archive.cover || ''
        base.videoTitle = archive.title || ''
        base.videoDuration = archive.duration_text || ''
      }
      // 图文
      if (major.type === 'MAJOR_TYPE_DRAW') {
        base.pics = (major.draw?.items || []).map(d => d.src || '').filter(Boolean)
      }
      // 文章
      if (major.type === 'MAJOR_TYPE_ARTICLE') {
        const article = major.article || {}
        base.articleTitle = article.title || ''
        base.articleCover = (article.covers || [])[0] || ''
        base.articleUrl = `https://www.bilibili.com/read/cv${article.id || ''}`
      }
      // 直播
      if (major.type === 'MAJOR_TYPE_LIVE_RCMD') {
        const live = major.live_rcmd || {}
        base.liveRoomId = live.room_id ? String(live.room_id) : ''
        base.liveTitle = live.title || ''
        base.liveCover = live.cover || ''
      }
    }

    // 转发
    if (type === 'DYNAMIC_TYPE_FORWARD') {
      const orig = desc.orig
      if (orig) {
        base.forwardText = extractRichText(orig.desc)
        base.forwardUpName = orig.name || ''
        // 转发的视频/图文
        if (orig.major?.archive) {
          base.forwardVideoBvid = orig.major.archive.bvid || ''
          base.forwardVideoCover = orig.major.archive.cover || ''
        }
        if (orig.major?.draw) {
          base.forwardPics = (orig.major.draw?.items || []).map(d => d.src || '').filter(Boolean)
        }
      }
    }
  }

  return base
}

/**
 * 从 B站富文本节点中提取纯文本
 * @param {object} descNode - module_dynamic.desc
 * @returns {string}
 */
function extractRichText(descNode) {
  if (!descNode) return ''
  if (typeof descNode === 'string') return descNode
  if (descNode.text) return descNode.text

  const richNodes = descNode.rich_text_nodes
  if (!richNodes || !Array.isArray(richNodes)) return ''

  return richNodes.map(node => {
    // 纯文本
    if (node.text) return node.text
    // 话题
    if (node.type === 'RICH_TEXT_NODE_TYPE_TOPIC') {
      return node.text || `#${node.topic_name || ''}#`
    }
    // @用户
    if (node.type === 'RICH_TEXT_NODE_TYPE_AT') {
      return node.text || `@${node.nick_name || ''}`
    }
    // 表情
    if (node.type === 'RICH_TEXT_NODE_TYPE_EMOJI') {
      return node.text || ''
    }
    // 链接
    if (node.type === 'RICH_TEXT_NODE_TYPE_LINK') {
      return node.text || ''
    }
    return node.text || ''
  }).join('')
}

export { fetchDynamicFeed, parseDynamicItem, DYNAMIC_TYPES, extractRichText }
