import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = __dirname
const configDir = path.join(pluginRoot, 'config')
const defSetDir = path.join(pluginRoot, 'defSet')

/**
 * 若目标配置文件不存在，从 .example 复制生成
 */
function ensureConfig(name) {
  const target = path.join(configDir, name)
  const example = path.join(configDir, `${name}.example`)
  if (!fs.existsSync(target) && fs.existsSync(example)) {
    fs.copyFileSync(example, target)
    logger.info(`[LinkFlow] 已从 ${name}.example 创建配置文件`)
  }
}

/**
 * 若目标配置文件不存在，从 defSet 模板用默认值生成
 * @param {string} targetName  生成到 config/ 的文件名
 * @param {string} templateSrc defSet/ 中的模板路径
 * @param {object} defaults    模板变量默认值
 */
function generateFromTemplate(targetName, templateSrc, defaults) {
  const target = path.join(configDir, targetName)
  if (fs.existsSync(target)) return
  const tpl = path.join(defSetDir, templateSrc)
  if (!fs.existsSync(tpl)) {
    logger.error(`[LinkFlow] 模板不存在: ${tpl}`)
    return
  }
  const template = fs.readFileSync(tpl, 'utf8')
  const content = template.replace(/\${(\w+)}/g, (_, name) => defaults[name] ?? '')
  const dir = path.dirname(target)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
  logger.info(`[LinkFlow] 已从模板 ${templateSrc} 生成 ${targetName}`)
}

// 从 example 复制主配置
ensureConfig('config.yaml')

// 从 .example 创建激励全局配置
ensureConfig('incentive_config.yaml')

// 确保 data 及运行时子目录存在
const dataDir = path.join(pluginRoot, 'data')
fs.mkdirSync(dataDir, { recursive: true })
const dirs = ['accounts', 'bot_accounts', 'subscribe', 'download_cache']
for (const d of dirs) {
  fs.mkdirSync(path.join(dataDir, d), { recursive: true })
}

// 确保链接解析白名单目录存在，从 .example 复制
  const lpWhitelistDir = path.join(configDir, 'linkparse_config')
  fs.mkdirSync(lpWhitelistDir, { recursive: true })
  ensureConfig(path.join('linkparse_config', 'whitelist.yaml'))

  // 确保激励运行时目录存在，白名单从 .example 复制
const whitelistDir = path.join(configDir, 'incentive_config')
fs.mkdirSync(whitelistDir, { recursive: true })
ensureConfig(path.join('incentive_config', 'whitelist.yaml'))

const readdir = promisify(fs.readdir)

logger.info('----LinkFlow-Plugin v2.0.0----')
logger.info('[LinkFlow] 初始化中...')

// 动态加载 apps/ 目录（不再硬编码路径）
const appsDir = path.join(pluginRoot, 'apps')
const files = await readdir(appsDir).catch(err => logger.error(err))

let ret = []
if (files) {
  files.forEach(file => {
    if (file.endsWith('.js')) {
      ret.push(import(`./apps/${file}`))
    }
  })
}

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  const name = files[i].replace('.js', '')
  if (ret[i].status !== 'fulfilled') {
    logger.error(`[LinkFlow] 载入错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

logger.info('[LinkFlow] 载入成功 owo')
logger.info('----LinkFlow-Plugin v2.0.0----')

export { apps }
