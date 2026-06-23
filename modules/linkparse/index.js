import { extractPlatformUrls } from './platforms.js'
import { resolveUrl } from './resolvers.js'
import { downloadMedia, createBiliCookieFile } from '../../model/MediaParser.js'
import { getPluginConfig } from '../../components/config.js'
import { render } from '../../components/render.js'
import { pluginVersion, yunzaiVersion } from '../../components/pluginVersion.js'
import { YTDLP_DEFAULT_TIMEOUT_MS, YTDLP_DEFAULT_MAX_SIZE_MB } from '../../components/constants.js'
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
 */
async function tryDownload(e, url, platformKey, meta) {
  const config = getPluginConfig()
  const dlCfg = config?.linkparse?.download

  // 下载总开关
  if (!dlCfg?.enabled) return

  // 群白名单检查
  if (e.isGroup && !isGroupAllowed(e.group_id)) return

  // 大小预估检查
  const maxSizeMb = dlCfg.maxSize || YTDLP_DEFAULT_MAX_SIZE_MB
  const timeout = dlCfg.timeout ? dlCfg.timeout * 1000 : YTDLP_DEFAULT_TIMEOUT_MS

  try {
    let cookieFile = null
    if (platformKey === 'bilibili') {
      cookieFile = await createBiliCookieFile()
    }

    const result = await downloadMedia(url, {
      timeout,
      maxSizeMb,
      cookiesFile: cookieFile || undefined,
    })

    if (result) {
      // 发送文件
      const sizeMb = parseFloat(result.metadata?.sizeMb || '0')
      const fileMsg = segment.file(result.filePath)

      if (sizeMb < 30) {
        // 小于 30MB 直接发送
        e.reply(fileMsg)
      } else {
        // 大于 30MB 发送文件路径提示
        e.reply(`[LinkFlow] ${result.metadata?.title || '视频'} (${sizeMb}MB) 已下载`)
      }
    }
  } catch (err) {
    logger?.error('[LinkFlow] 下载失败:', err.message)
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
