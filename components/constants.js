import path from 'node:path'

const _path = process.cwd().replace(/\\/g, '/')
const pluginName = 'LinkFlow-Plugin'
const pluginRoot = path.join(_path, 'plugins', pluginName)

/** 插件资源路径 */
const pluginData = path.join(pluginRoot, 'data')
const accountsDir = path.join(pluginData, 'accounts')
const subscribeDataDir = path.join(pluginData, 'subscribe')

/** B站 API */
const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav'
const MISSION_INFO_URL = 'https://api.bilibili.com/x/activity_components/mission/info'
const MISSION_RECEIVE_URL = 'https://api.bilibili.com/x/activity_components/mission/receive'
const QRCODE_GENERATE_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const QRCODE_POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'

/** B站 动态/用户 API */
const FEED_SPACE_URL = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space'
const SPACE_ACC_INFO_URL = 'https://api.bilibili.com/x/space/wbi/acc/info'
const FINGER_SPI_URL = 'https://api.bilibili.com/x/frontend/finger/spi'
const GEN_WEB_TICKET_URL = 'https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket'
const GATEWAY_EXCLIMB_URL = 'https://api.bilibili.com/x/internal/gaia-gateway/ExClimbWuzhi'
const LOGOUT_URL = 'https://passport.bilibili.com/login/exit/v2'
const RTC_TIMESTAMP_URL = 'https://api.live.bilibili.com/xlive/open-interface/v1/rtc/getTimestamp'

/** 请求头 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0'
/** 动态 API 专用 UA（Chrome，与 yuki-plugin 一致） */
const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
const WEB_LOCATION = '888.126558'
const DYNAMIC_WEB_LOCATION = '333.999'

/** dm_img 反爬参数（硬编码 base64 值） */
const DM_IMG_LIST = '[]'
const DM_IMG_STR = 'V2ViR0wgMS'
const DM_COVER_IMG_STR = 'QU5HTEUgKEludGVsLCBJbnRlbChSKSBIRCBHcmFwaGljcyBEaXJlY3QzRDExIHZzXzVfMCBwc181XzApLCBvciBzaW1pbGFyR29vZ2xlIEluYy4gKEludGVsKQ'
const DM_IMG_INTER = '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}'

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

/** Redis 前缀 */
const REDIS_PREFIX_BOT_COOKIE = 'LinkFlow:bot:bili:cookie'
const REDIS_PREFIX_WBI_KEY = 'LinkFlow:bot:bili:wbi_img_key'
const REDIS_PREFIX_DYNAMIC_GROUP = 'LinkFlow:dynamic:group'
const REDIS_PREFIX_DYNAMIC_PRIVATE = 'LinkFlow:dynamic:private'

/** 动态订阅默认配置 */
const DYNAMIC_DEFAULT_CRON = '0 */10 * * * ?'
const DYNAMIC_DEFAULT_TIME_RANGE = 7200        // 仅推送 2 小时内的动态（秒）
const DYNAMIC_DEFAULT_SLEEP = 0                // 群间推送间隔（秒）
const DYNAMIC_DEFAULT_UP_FETCH_DELAY = 3000    // UP 之间查询间隔（ms）

export {
  _path,
  pluginName,
  pluginRoot,
  pluginData,
  accountsDir,
  subscribeDataDir,
  NAV_URL,
  MISSION_INFO_URL,
  MISSION_RECEIVE_URL,
  QRCODE_GENERATE_URL,
  QRCODE_POLL_URL,
  FEED_SPACE_URL,
  SPACE_ACC_INFO_URL,
  FINGER_SPI_URL,
  GEN_WEB_TICKET_URL,
  GATEWAY_EXCLIMB_URL,
  LOGOUT_URL,
  RTC_TIMESTAMP_URL,
  DEFAULT_USER_AGENT,
  CHROME_USER_AGENT,
  WEB_LOCATION,
  DYNAMIC_WEB_LOCATION,
  DM_IMG_LIST,
  DM_IMG_STR,
  DM_COVER_IMG_STR,
  DM_IMG_INTER,
  MISSION_INFO_RETRY_SECONDS,
  MISSION_INFO_RETRY_INTERVAL,
  LOGIN_POLL_TIMEOUT_SECONDS,
  LOGIN_POLL_INTERVAL_SECONDS,
  MIXIN_KEY_ENC_TAB,
  REDIS_PREFIX_BOT_COOKIE,
  REDIS_PREFIX_WBI_KEY,
  REDIS_PREFIX_DYNAMIC_GROUP,
  REDIS_PREFIX_DYNAMIC_PRIVATE,
  DYNAMIC_DEFAULT_CRON,
  DYNAMIC_DEFAULT_TIME_RANGE,
  DYNAMIC_DEFAULT_SLEEP,
  DYNAMIC_DEFAULT_UP_FETCH_DELAY,
}
