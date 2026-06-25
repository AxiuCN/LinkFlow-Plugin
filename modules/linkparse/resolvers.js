import { getVideoInfo, getUserInfo } from '../../model/bilibili/video.js'
import { mediaParser } from '../../model/MediaParser.js'
import { isLiveUrl } from './platforms.js'

/**
 * 解析 B站 URL
 * 优先用自有 B站 API（快速，无需 Python 服务），API 失败时降级 media_parser
 * @param {string} url
 * @returns {Promise<object|null>} 归一化的元数据
 */
async function resolveBilibili(url) {
  // 直播不解析为视频
  if (isLiveUrl(url)) return null

  // 提取 BV 号
  let bvid = null
  const bvMatch = url.match(/\/video\/(BV[\w]+)/i) || url.match(/(BV[\w]{10,})/i)
  if (bvMatch) bvid = bvMatch[1]

  // b23.tv 短链接展开
  if (!bvid && /b23\.tv/i.test(url)) {
    try {
      const { default: fetch } = await import('node-fetch')
      const res = await fetch(url, { redirect: 'manual' })
      const loc = res.headers.get('location') || ''
      const bvFromRedirect = loc.match(/\/video\/(BV[\w]+)/i) || loc.match(/(BV[\w]{10,})/i)
      if (bvFromRedirect) bvid = bvFromRedirect[1]
    } catch {}
  }

  if (!bvid) {
    // 非 BV 号链接（动态、直播、空间等）走 media_parser 降级
    return await resolveGeneric(url)
  }

  // BV 号 → 调用 B站自有 API 获取详情
  const info = await getVideoInfo(bvid)
  if (!info) {
    // B站 API 失败，降级 media_parser
    return await resolveGeneric(url)
  }

  return {
    platform: 'bilibili',
    id: info.bvid,
    title: info.title,
    description: info.desc || '',
    uploader: info.owner?.name || '',
    uploaderId: info.owner?.uid || '',
    uploaderFace: info.owner?.face || '',
    duration: info.duration || 0,
    durationText: info.durationText || '',
    thumbnail: info.cover || '',
    viewCount: info.stat?.view || 0,
    likeCount: info.stat?.like || 0,
    replyCount: info.stat?.reply || 0,
    favoriteCount: info.stat?.favorite || 0,
    pages: info.pages || [],
    pubdate: info.pubdate || 0,
    category: info.tname || '',
    source: 'bilibili-api',
  }
}

/**
 * 解析非 B站 URL（通过 media_parser）
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function resolveGeneric(url) {
  if (isLiveUrl(url)) return null

  // 通过 media_parser 服务解析
  const results = await mediaParser.parse(url)
  if (!results || !Array.isArray(results) || !results.length) return null

  // 取第一个匹配结果
  const meta = results[0]
  if (!meta) return null

  return {
    platform: meta.platform || meta.extractorKey || 'unknown',
    id: meta.id || '',
    title: meta.title || '',
    description: meta.desc || meta.description || '',
    uploader: meta.author || meta.uploader || '',
    uploaderId: meta.uploaderId || '',
    duration: meta.duration || 0,
    thumbnail: meta.thumbnail || meta.cover || '',
    videoUrls: meta.video_urls || [],
    imageUrls: meta.image_urls || [],
    source: 'media-parser',
  }
}

/**
 * 解析任意 URL 的入口
 * @param {string} url
 * @param {string} platformKey - 平台标识（platforms.js 中的 key）
 * @returns {Promise<object|null>}
 */
async function resolveUrl(url, platformKey) {
  if (platformKey === 'bilibili') {
    return await resolveBilibili(url)
  }
  return await resolveGeneric(url)
}

export { resolveBilibili, resolveGeneric, resolveUrl }
