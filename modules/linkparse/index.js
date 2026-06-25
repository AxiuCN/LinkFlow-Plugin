import { extractPlatformUrls } from './platforms.js'
import { resolveUrl } from './resolvers.js'
import { mediaParser } from '../../model/MediaParser.js'
import { download as bbdownDownload } from '../../model/BBDown.js'
import { getPluginConfig } from '../../components/config.js'
import { render } from '../../components/render.js'
import { pluginVersion, yunzaiVersion } from '../../components/pluginVersion.js'
import { DOWNLOAD_DEFAULT_TIMEOUT_MS, DOWNLOAD_DEFAULT_MAX_SIZE_MB } from '../../components/constants.js'
import { isGroupAllowed } from './Whitelist.js'

/**
 * 处理消息中的链接：提取 → 解析 → 展示 → 下载
 * @param {object} e - Yunzai 消息事件
 * @param {string} text - 消息文本
 */
async function handleMessage(e, text) {
  const config = getPluginConfig()

  // 总开关
  if (!config?.linkparse?.enabled) return

  // 提取平台 URL
  const platformUrls = extractPlatformUrls(text)
  if (!platformUrls.length) return

  for (const { url, platform } of platformUrls) {
    // 检查平台开关
    const platformCfg = config?.linkparse?.[platform.key]
    if (platformCfg?.enabled === false) continue

    try {
      // 1. 解析元数据
      const meta = await resolveUrl(url, platform.key)
      if (!meta) continue

      // 2. 展示信息卡
      await showInfoCard(e, meta, platform)

      // 3. 下载（如果配置允许）
      await tryDownload(e, url, platform.key, meta)

    } catch (err) {
      logger?.error(`[LinkFlow] 处理 ${platform.key} URL 异常:`, err)
    }
  }
}

/**
 * 展示解析结果 HTML 信息卡
 */
async function showInfoCard(e, meta, platform) {
  try {
    const img = await render('linkparse/card', 'index', {
      ...meta,
      platformName: platform.name || meta.platform,
      version: pluginVersion,
      yunzaiVersion,
    }, 'png')

    if (img) {
      e.reply(img)
    }
  } catch (err) {
    logger?.error('[LinkFlow] 渲染信息卡失败:', err)
  }
}

/**
 * 尝试下载视频
 * 下载策略:
 *   B站:  BBDown（独立方案）→ media_parser（降级）
 *   其他:    media_parser（统一方案）
 */
async function tryDownload(e, url, platformKey, meta) {
  const config = getPluginConfig()
  const dlCfg = config?.linkparse?.download

  // 下载总开关
  if (!dlCfg?.enabled) return

  // 群白名单检查
  if (e.isGroup && !isGroupAllowed(e.group_id)) return

  const maxSizeMb = dlCfg.maxSize || DOWNLOAD_DEFAULT_MAX_SIZE_MB
  const timeout = dlCfg.timeout ? dlCfg.timeout * 1000 : DOWNLOAD_DEFAULT_TIMEOUT_MS

  try {
    let result = null

    if (platformKey === 'bilibili') {
      // B站: BBDown 独立方案优先
      logger?.info('[LinkFlow] B站下载: 尝试 BBDown ...')
      result = await bbdownDownload(url, {
        timeout,
        maxSizeMb,
        useAria2: config?.tool?.bbdown?.useAria2 || false,
        resolution: config?.tool?.bbdown?.resolution || undefined,
      })

      if (!result) {
        // BBDown 失败，降级 media_parser
        logger?.info('[LinkFlow] B站下载: BBDown 失败，降级 media_parser ...')
        result = await mediaParser.download(meta, { maxSizeMb })
      }
    } else {
      // 其他平台: 直接走 media_parser
      result = await mediaParser.download(meta, { maxSizeMb })
    }

    if (result) {
      await sendResult(e, result, maxSizeMb)
    }
  } catch (err) {
    logger?.error('[LinkFlow] 下载失败:', err.message)
  }
}

/**
 * 发送下载结果（文件或提示）
 * @param {object} e - Yunzai 消息事件
 * @param {object} result - 下载结果
 * @param {number} maxSizeMb - 大小限制
 */
async function sendResult(e, result, maxSizeMb) {
  // media_parser 返回的 file_paths 列表
  const filePaths = result.file_paths || result.filePaths || []

  for (const fp of filePaths) {
    if (!fp) continue
    try {
      const { default: fs } = await import('node:fs')
      if (!fs.existsSync(fp)) continue

      const stat = fs.statSync(fp)
      const sizeMb = stat.size / (1024 * 1024)

      if (sizeMb > maxSizeMb) {
        e.reply(`[LinkFlow] ${result.title || '视频'} (${sizeMb.toFixed(1)}MB) 超过上限 ${maxSizeMb}MB，已跳过`)
        continue
      }

      const fileMsg = segment.file(fp)
      if (sizeMb < 30) {
        e.reply(fileMsg)
      } else {
        e.reply(`[LinkFlow] ${result.title || '视频'} (${sizeMb.toFixed(1)}MB) 已下载: ${fp}`)
      }
    } catch (err) {
      logger?.error(`[LinkFlow] 发送文件失败: ${err.message}`)
    }
  }

  // 没有 file_paths 但有下载成功的条目，给个提示
  if (!filePaths.length) {
    // 检查是否有 video_modes = 'direct'
    const videoModes = result.video_modes || result.videoModes || []
    const directCount = videoModes.filter(m => m === 'direct').length
    const localCount = videoModes.filter(m => m === 'local').length

    if (localCount > 0) {
      logger?.info(`[LinkFlow] 下载完成: ${localCount} 个本地文件`)
    } else if (directCount > 0) {
      e.reply(`[LinkFlow] ${result.title || '视频'} 已解析，直接链接已就绪`)
    }
  }
}

/**
 * 获取当前群的解析开关状态
 * @param {string|number} groupId
 * @returns {boolean}
 */
function isGroupEnabled(groupId) {
  const config = getPluginConfig()
  if (!config?.linkparse?.enabled) return false
  return isGroupAllowed(groupId)
}

export { handleMessage, isGroupEnabled }
