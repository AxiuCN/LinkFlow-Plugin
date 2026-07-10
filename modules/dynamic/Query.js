/**
 * 动态数据格式化
 *
 * 职责：
 * - API 原始响应 → HTML 模板所需的扁平化数据
 * - 富文本节点（RICH_TEXT_NODE_TYPE_*）→ HTML 片段
 * - 类型关键词 ↔ B站 类型常量映射
 */

// ========== 类型常量映射 ==========

/** 中文关键词 → B站 动态类型常量 */
const TYPE_KEYWORDS = {
  '视频': 'DYNAMIC_TYPE_AV',
  '图文': ['DYNAMIC_TYPE_DRAW', 'DYNAMIC_TYPE_WORD'],
  '文章': 'DYNAMIC_TYPE_ARTICLE',
  '转发': 'DYNAMIC_TYPE_FORWARD',
  '直播': 'DYNAMIC_TYPE_LIVE_RCMD',
}

/** 动态类型 → 中文标签 */
const TYPE_LABELS = {
  DYNAMIC_TYPE_AV: '视频',
  DYNAMIC_TYPE_WORD: '图文',
  DYNAMIC_TYPE_DRAW: '图文',
  DYNAMIC_TYPE_ARTICLE: '文章',
  DYNAMIC_TYPE_FORWARD: '转发',
  DYNAMIC_TYPE_LIVE_RCMD: '直播',
}

/**
 * 中文关键词 → 类型常量数组
 * @param {string} keyword - 中文关键词，如"视频""图文"
 * @returns {string[]}
 */
function keywordToTypes(keyword) {
  const val = TYPE_KEYWORDS[keyword]
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

/**
 * 类型常量 → 中文标签
 * @param {string} type
 * @returns {string}
 */
function typeToLabel(type) {
  return TYPE_LABELS[type] || '未知'
}

// ========== 富文本节点 → HTML ==========

/**
 * 将富文本节点数组转换为 HTML 字符串
 * @param {Array<{type: string, text?: string, orig_text?: string, jump_url?: string, emoji?: object}>} nodes
 * @returns {string}
 */
function parseRichTextNodes(nodes) {
  if (!Array.isArray(nodes)) return ''

  return nodes.map(node => {
    const type = node.type
    const text = escapeHtml(node.text || node.orig_text || '')

    switch (type) {
      // 纯文本（换行 → <br>）
      case 'RICH_TEXT_NODE_TYPE_TEXT':
        return text.replace(/\n/g, '<br>')

      // 话题 #xxx#
      case 'RICH_TEXT_NODE_TYPE_TOPIC':
        return `<a class="topic">#${text}#</a>`

      // @用户
      case 'RICH_TEXT_NODE_TYPE_AT':
        return `<span class="at">@${text}</span>`

      // 表情图片
      case 'RICH_TEXT_NODE_TYPE_EMOJI': {
        const emoji = node.emoji || {}
        const src = emoji.icon_url || ''
        return src ? `<img class="emoji" src="${src}" alt="${emoji.text || ''}" />` : text
      }

      // BV 视频引用
      case 'RICH_TEXT_NODE_TYPE_BV': {
        const url = node.jump_url || ''
        return url ? `<a class="link" href="${url}">${text}</a>` : text
      }

      // 网页链接
      case 'RICH_TEXT_NODE_TYPE_WEB': {
        const url = node.jump_url || ''
        return url ? `<a class="link" href="${url}">${text || url}</a>` : text
      }

      // 抽奖/互动
      case 'RICH_TEXT_NODE_TYPE_LOTTERY':
        return `<span class="lottery">${text}</span>`

      // 商品
      case 'RICH_TEXT_NODE_TYPE_GOODS':
        return `<span class="goods">${text}</span>`

      // 投票
      case 'RICH_TEXT_NODE_TYPE_VOTE':
        return `<span class="vote">${text}</span>`

      default:
        return text
    }
  }).join('')
}

/** 基本 HTML 转义 */
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ========== 格式化时间 ==========

/**
 * 时间戳 → 相对时间
 * @param {number} ts - Unix 秒级时间戳
 * @returns {string}
 */
function formatTime(ts) {
  if (!ts) return ''
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts

  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ========== 主格式化函数 ==========

/**
 * 格式化单条动态为 HTML 模板数据
 *
 * @param {object} item - API 返回的单个动态条目
 *   (来自 feed/space → data.items[i])
 * @returns {object} { type, typeLabel, time, hasContent, hasForward, title, content, pics, cover, jumpUrl, forward }
 */
function formatDynamicItem(item) {
  if (!item) return null

  const type = item.type || item.id_str ? getTypeFromItem(item) : 'DYNAMIC_TYPE_WORD'
  const modules = item.modules || {}
  const moduleDynamic = modules.module_dynamic || {}
  const desc = moduleDynamic.desc
  const major = moduleDynamic.major || {}

  // 文本内容（富文本）
  let contentHtml = ''
  if (desc?.rich_text_nodes) {
    contentHtml = parseRichTextNodes(desc.rich_text_nodes)
  } else if (desc?.text) {
    contentHtml = escapeHtml(desc.text).replace(/\n/g, '<br>')
  }

  // 时间
  const pubTs = item.pub_ts || (item.author && item.author.pub_ts)
  const time = formatTime(pubTs || (Date.now() / 1000))

  const result = {
    type,
    typeLabel: typeToLabel(type),
    time,
    dynamicId: item.id_str || '',
    content: contentHtml,
    pics: [],
    cover: '',
    title: '',
    jumpUrl: '',
    hasForward: false,
    forward: null,
  }

  // 按类型提取数据
  switch (type) {
    case 'DYNAMIC_TYPE_AV': {
      const archive = major.archive || {}
      result.title = archive.title || ''
      result.cover = archive.cover || ''
      result.jumpUrl = archive.jump_url || ''
      result.pics = result.cover ? [{ url: result.cover, width: 0, height: 0 }] : []
      break
    }

    case 'DYNAMIC_TYPE_WORD': {
      const opus = major.opus || {}
      result.title = opus.title || ''
      if (!result.content && opus.summary?.text) {
        result.content = escapeHtml(opus.summary.text).replace(/\n/g, '<br>')
      }
      result.pics = (opus.pics || []).map(p => ({ url: p.url, width: p.width || 0, height: p.height || 0 }))
      break
    }

    case 'DYNAMIC_TYPE_DRAW': {
      const draw = major.draw || {}
      const drawItems = draw.items || []
      result.title = opusOrDraw(major)?.title || ''
      result.pics = drawItems.map(p => ({ url: p.src, width: p.width || 0, height: p.height || 0 }))
      break
    }

    case 'DYNAMIC_TYPE_ARTICLE': {
      const article = major.article || {}
      const opus = major.opus || {}
      result.title = article.title || opus.title || ''
      result.cover = article.covers?.[0] || ''
      result.jumpUrl = article.jump_url || opus.jump_url || ''
      result.pics = article.covers ? article.covers.map(c => ({ url: c, width: 0, height: 0 })) : []
      break
    }

    case 'DYNAMIC_TYPE_FORWARD': {
      result.hasForward = true
      if (item.orig) {
        result.forward = formatDynamicItem(item.orig)
      }
      break
    }

    case 'DYNAMIC_TYPE_LIVE_RCMD': {
      const liveRcmd = major.live_rcmd || {}
      let liveContent = {}
      try {
        liveContent = typeof liveRcmd.content === 'string'
          ? JSON.parse(liveRcmd.content)
          : liveRcmd.content || {}
      } catch {}
      result.title = liveContent.title || ''
      result.cover = liveContent.cover || ''
      result.jumpUrl = (liveContent.live_play_info || {}).link || ''
      result.pics = result.cover ? [{ url: result.cover, width: 0, height: 0 }] : []
      break
    }
  }

  // 图片数上限（防止渲染过大的卡片）
  if (result.pics.length > 9) {
    result.pics = result.pics.slice(0, 9)
  }

  return result
}

/**
 * 从 item 推断动态类型
 */
function getTypeFromItem(item) {
  const desc = item.modules?.module_dynamic?.desc
  if (desc?.type) return desc.type
  const major = item.modules?.module_dynamic?.major
  if (!major) {
    // 回退：看 top 是否有 type
    if (item.type) return item.type
    return 'DYNAMIC_TYPE_WORD'
  }
  if (major.archive) return 'DYNAMIC_TYPE_AV'
  if (major.draw) return 'DYNAMIC_TYPE_DRAW'
  if (major.article) return 'DYNAMIC_TYPE_ARTICLE'
  if (major.live_rcmd) return 'DYNAMIC_TYPE_LIVE_RCMD'
  if (major.opus) return 'DYNAMIC_TYPE_WORD'
  // 如果 major 有 type
  if (major.type) return major.type
  return 'DYNAMIC_TYPE_WORD'
}

/** DRAW 类型：从 opus 或 draw 提取 title 等通用字段 */
function opusOrDraw(major) {
  return major.opus || major.draw || {}
}

// ========== 过滤 ==========

/**
 * 检查动态的类型是否匹配订阅者指定的类型过滤
 * @param {string} itemType - 动态的类型常量
 * @param {string[]} filterTypes - 订阅者指定的中文关键词数组，空数组 = 全部
 * @returns {boolean}
 */
function typeMatches(itemType, filterTypes) {
  if (!Array.isArray(filterTypes) || filterTypes.length === 0) return true
  // 将过滤器展开为类型常量集合
  const allowed = new Set()
  for (const kw of filterTypes) {
    const types = keywordToTypes(kw)
    types.forEach(t => allowed.add(t))
  }
  return allowed.has(itemType)
}

export { formatDynamicItem, parseRichTextNodes, keywordToTypes, typeToLabel, typeMatches, formatTime }
