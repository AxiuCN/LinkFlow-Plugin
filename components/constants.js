import path from 'node:path'

const _path = process.cwd().replace(/\\/g, '/')
const pluginName = 'LinkFlow-Plugin'
const pluginRoot = path.join(_path, 'plugins', pluginName)

/** 插件资源路径 */
const pluginData = path.join(pluginRoot, 'data')
const botAccountsDir = path.join(pluginData, 'bot_accounts')
const accountsDir = path.join(pluginData, 'accounts')
const subscribeDataDir = path.join(pluginData, 'subscribe')
const downloadCacheDir = path.join(pluginData, 'download_cache')
const toolDir = path.join(pluginRoot, 'tool')
const ytDlpPath = path.join(toolDir, 'yt-dlp', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')

/** B站 API */
const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav'
const MISSION_INFO_URL = 'https://api.bilibili.com/x/activity_components/mission/info'
const MISSION_RECEIVE_URL = 'https://api.bilibili.com/x/activity_components/mission/receive'
const QRCODE_GENERATE_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const QRCODE_POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'
const DYNAMIC_SPACE_URL = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space'
const USER_INFO_URL = 'https://api.bilibili.com/x/space/wbi/acc/info'
const VIDEO_INFO_URL = 'https://api.bilibili.com/x/web-interface/view'
const SEARCH_URL = 'https://api.bilibili.com/x/web-interface/search/type'

/** 请求头 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
const WEB_LOCATION = '888.126558'

/** 领取配置 */
const MISSION_INFO_RETRY_SECONDS = 30
const MISSION_INFO_RETRY_INTERVAL = 1.0
const LOGIN_POLL_TIMEOUT_SECONDS = 180
const LOGIN_POLL_INTERVAL_SECONDS = 1.5

/** yt-dlp 下载配置 */
const YTDLP_UPDATE_INTERVAL_DAYS = 30
const YTDLP_DEFAULT_TIMEOUT_MS = 600000
const YTDLP_DEFAULT_MAX_SIZE_MB = 100

/** WBI 密钥混淆表 — 固定映射，不可修改 */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

export {
  _path,
  pluginName,
  pluginRoot,
  pluginData,
  botAccountsDir,
  accountsDir,
  subscribeDataDir,
  downloadCacheDir,
  toolDir,
  ytDlpPath,
  NAV_URL,
  MISSION_INFO_URL,
  MISSION_RECEIVE_URL,
  QRCODE_GENERATE_URL,
  QRCODE_POLL_URL,
  DYNAMIC_SPACE_URL,
  USER_INFO_URL,
  VIDEO_INFO_URL,
  SEARCH_URL,
  DEFAULT_USER_AGENT,
  WEB_LOCATION,
  MISSION_INFO_RETRY_SECONDS,
  MISSION_INFO_RETRY_INTERVAL,
  LOGIN_POLL_TIMEOUT_SECONDS,
  LOGIN_POLL_INTERVAL_SECONDS,
  YTDLP_UPDATE_INTERVAL_DAYS,
  YTDLP_DEFAULT_TIMEOUT_MS,
  YTDLP_DEFAULT_MAX_SIZE_MB,
  MIXIN_KEY_ENC_TAB,
}
