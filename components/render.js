import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import path from 'node:path'
import fs from 'node:fs'
import { pluginRoot, pluginName } from './constants.js'

/**
 * 调用 Yunzai puppeteer 模块渲染 HTML 模板为图片
 * @param {string} app   - 资源子目录名（如 'help'）
 * @param {string} tpl   - 模板名（如 'index'）
 * @param {object} data  - 模板数据
 * @param {string} [imgType='jpeg'] - 图片格式 'jpeg' | 'png'
 * @returns {Promise<object>} puppeteer 消息段，可直接传入 e.reply()
 */
export async function render(app, tpl, data = {}, imgType = 'jpeg') {
  data._plugin = pluginName
  // 根据 app 目录深度动态计算 _res_path
  const depth = 4 + app.split('/').length
  data._res_path = `${'../'.repeat(depth)}plugins/${pluginName}/resources/`

  if (imgType === 'png') {
    data.omitBackground = true
  }
  data.imgType = imgType

  // 缓存目录
  const dataDir = path.join(process.cwd(), 'data', 'html', pluginName, app, tpl)
  fs.mkdirSync(dataDir, { recursive: true })

  data.saveId = data.saveId || data.save_id || tpl
  data.tplFile = `./plugins/${pluginName}/resources/${app}/${tpl}.html`
  data.pluResPath = data._res_path
  data.pageGotoParams = { waitUntil: 'networkidle0' }

  // 布局文件
  data.elemLayout = path.join(pluginRoot, 'resources', 'common', 'layout', 'elem.html')
  data.defaultLayout = path.join(pluginRoot, 'resources', 'common', 'layout', 'default.html')

  // 版权信息
  data.sys = {
    copyright: `Created By TRSS-yunzai & ${pluginName}`
  }

  return await puppeteer.screenshot(`${pluginName}/${app}/${tpl}`, data)
}
