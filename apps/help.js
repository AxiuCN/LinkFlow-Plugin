import { render } from '../components/render.js'
import { pluginRoot } from '../components/constants.js'
import { pluginVersion } from '../components/pluginVersion.js'

export class LinkFlowHelp extends plugin {
  constructor() {
    super({
      name: '[LinkFlow]帮助',
      dsc: '查看LinkFlow-Plugin帮助',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#(linkflow|LinkFlow|链流|b站|B站)帮助$/i, fnc: 'help' },
      ],
    })
  }

  async help(e) {
    try {
      const helpPath = `${pluginRoot}/resources/help/help-cfg.js`
      const { helpCfg, helpList } = await import(`file://${helpPath}?t=${Date.now()}`)

      const helpGroup = []
      for (const group of helpList) {
        if (group.auth === 'master' && !e.isMaster) continue

        const list = []
        for (const item of group.list) {
          list.push({
            title: item.title,
            desc: item.desc,
          })
        }
        helpGroup.push({
          group: group.group,
          list,
        })
      }

      const data = {
        helpCfg: {
          title: helpCfg.title || 'LinkFlow 帮助',
          subTitle: `链流插件 v${pluginVersion}`,
        },
        helpGroup,
      }

      const img = await render('help', 'index', data, 'png')
      if (!img) return e.reply('[LinkFlow] 帮助图生成失败，请重试。')
      return e.reply(img)
    } catch (err) {
      logger.error('[LinkFlow] 帮助图生成失败:', err)
      return e.reply('[LinkFlow] 帮助图生成失败，请重试。')
    }
  }
}
