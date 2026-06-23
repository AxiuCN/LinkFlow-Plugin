import fs from 'node:fs'
import path from 'node:path'
import { pluginRoot } from './constants.js'

/** 插件版本 */
const pkgPath = path.join(pluginRoot, 'package.json')
let pluginVersion = '1.0.0'
try {
  if (fs.existsSync(pkgPath)) {
    pluginVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '1.0.0'
  }
} catch (e) {
  logger.error('[LinkFlow] 读取版本号失败:', e)
}

/** Yunzai 版本 */
const yunzaiPkgPath = path.join(process.cwd(), 'package.json')
let yunzaiVersion = 'TRSS-Yunzai'
try {
  if (fs.existsSync(yunzaiPkgPath)) {
    yunzaiVersion = JSON.parse(fs.readFileSync(yunzaiPkgPath, 'utf8')).version || 'TRSS-Yunzai'
  }
} catch (e) { /* 忽略 */ }

export { pluginVersion, yunzaiVersion }
