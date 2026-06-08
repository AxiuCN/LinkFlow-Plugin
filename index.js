import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const configDir = path.join(__dirname, 'config')
const defSetDir = path.join(__dirname, 'defSet')

/**
 * 若目标配置文件不存在，从 .example 复制生成
 */
function ensureConfig(name) {
  const target = path.join(configDir, name)
  const example = path.join(configDir, `${name}.example`)
  if (!fs.existsSync(target) && fs.existsSync(example)) {
    fs.copyFileSync(example, target)
    logger.info(`[Bilibili-Plugin] 已从 ${name}.example 创建配置文件`)
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
    logger.error(`[Bilibili-Plugin] 模板不存在: ${tpl}`)
    return
  }
  const template = fs.readFileSync(tpl, 'utf8')
  const content = template.replace(/\${(\w+)}/g, (_, name) => defaults[name] ?? '')
  const dir = path.dirname(target)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
  logger.info(`[Bilibili-Plugin] 已从模板 ${templateSrc} 生成 ${targetName}`)
}

// 从 example 复制主配置
ensureConfig('config.yaml')

// 从 .example 创建激励全局配置（保留 ${notifyGroup} 占位符供 createDefaultUserConfig 使用）
ensureConfig('incentive_config.yaml')

// 确保 data 及运行时子目录存在
const dataDir = path.join(__dirname, 'data')
fs.mkdirSync(dataDir, { recursive: true })

// 确保激励运行时目录存在，白名单从 .example 复制
const whitelistDir = path.join(configDir, 'incentive_config')
fs.mkdirSync(whitelistDir, { recursive: true })
ensureConfig(path.join('incentive_config', 'whitelist.yaml'))

const readdir = promisify(fs.readdir)

logger.info('----Bilibili-Plugin----')
logger.info('[Bilibili-Plugin] 初始化中...')

const files = await readdir('./plugins/Bilibili-Plugin/apps').catch(err => logger.error(err))

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
    logger.error(`[Bilibili-Plugin] 载入错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

logger.info('[Bilibili-Plugin] 载入成功 owo')
logger.info('----Bilibili-Plugin----')

export { apps }
