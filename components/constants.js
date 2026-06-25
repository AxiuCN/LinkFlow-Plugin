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

/** 外部工具路径 */
const isWin = process.platform === 'win32'
const bbdownPath = path.join(toolDir, 'bbdown', isWin ? 'BBDown.exe' : 'BBDown')
const ffmpegPath = path.join(toolDir, 'ffmpeg', isWin ? 'ffmpeg.exe' : 'ffmpeg')
const aria2cPath = path.join(toolDir, 'aria2', isWin ? 'aria2c.exe' : 'aria2c')
const mediaParserDir = path.join(toolDir, 'media_parser')
const mediaParserVenvDir = path.join(mediaParserDir, 'venv')
const mediaParserServerPath = path.join(mediaParserDir, 'server.py')

/** GitHub 工具仓库配置 */
const TOOL_REPOS = {
  bbdown: { repo: 'nilaoda/BBDown', command: isWin ? 'BBDown.exe' : 'BBDown' },
  ffmpeg: { repo: 'GyanD/codexffmpeg', command: isWin ? 'ffmpeg.exe' : 'ffmpeg' },
  aria2: { repo: 'aria2/aria2', command: isWin ? 'aria2c.exe' : 'aria2c' },
}

/** GitHub Asset 匹配模式（include / exclude） */
const TOOL_ASSET_PATTERNS = {
  bbdown: {
    win: { include: /BBDown.*(?:win|windows).*x64.*\.zip$/i, exclude: /arm|aarch|i386|i686|32bit/i },
    linux: { include: /BBDown.*linux.*x64.*\.zip$/i, exclude: /arm|aarch/i },
  },
  ffmpeg: {
    win: { include: /ffmpeg-.*-essentials_build\.zip$/i, exclude: /full_build|arm|aarch/i },
    linux: { include: /ffmpeg-.*linux64.*gpl.*\.tar\.xz$/i, exclude: /arm|aarch/i },
  },
  aria2: {
    win: { include: /aria2.*win.*(amd64|x86_64|x64|64bit).*\.zip$/i, exclude: /arm|aarch|i386|i686|32bit/i },
    linux: { include: /aria2.*linux.*(amd64|x86_64|64bit).*\.tar\.(gz|xz)$/i, exclude: /arm|aarch/i },
  },
}

/** 下载配置 */
const DOWNLOAD_DEFAULT_TIMEOUT_MS = 600000
const DOWNLOAD_DEFAULT_MAX_SIZE_MB = 100

/** media_parser 服务配置 */
const MEDIA_PARSER_DEFAULT_PORT = 19810
const MEDIA_PARSER_STARTUP_TIMEOUT_MS = 30000
const MEDIA_PARSER_RESTART_LIMIT = 3
const MEDIA_PARSER_RESTART_WINDOW_MS = 300000

/** 工具下载配置 */
const TOOL_GITHUB_API_BASES = [
  'https://api.github.com',
  'https://ghproxy.cn/https://api.github.com',
]
const TOOL_DOWNLOAD_TIMEOUT_MS = 300000
const TOOL_FFMPEG_MIRROR_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials_build.zip'

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
  bbdownPath,
  ffmpegPath,
  aria2cPath,
  mediaParserDir,
  mediaParserVenvDir,
  mediaParserServerPath,
  TOOL_REPOS,
  TOOL_ASSET_PATTERNS,
  DOWNLOAD_DEFAULT_TIMEOUT_MS,
  DOWNLOAD_DEFAULT_MAX_SIZE_MB,
  MEDIA_PARSER_DEFAULT_PORT,
  MEDIA_PARSER_STARTUP_TIMEOUT_MS,
  MEDIA_PARSER_RESTART_LIMIT,
  MEDIA_PARSER_RESTART_WINDOW_MS,
  TOOL_GITHUB_API_BASES,
  TOOL_DOWNLOAD_TIMEOUT_MS,
  TOOL_FFMPEG_MIRROR_URL,
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
  MIXIN_KEY_ENC_TAB,
}
