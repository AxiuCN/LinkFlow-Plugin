import { render } from '../components/render.js'

export class BiliHelp extends plugin {
  constructor() {
    super({
      name: '[B站插件]帮助',
      dsc: '查看Bilibili-Plugin帮助',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#B站帮助$', fnc: 'help' },
      ],
    })
  }

  async help(e) {
    try {
      const helpPath = `${process.cwd()}/plugins/Bilibili-Plugin/resources/help/help-cfg.js`
      const { helpCfg, helpList } = await import(`file://${helpPath}?t=${Date.now()}`)

      const helpGroup = []
      for (const group of helpList) {
        if (group.auth === 'master' && !e.isMaster) continue

        const list = []
        for (const item of group.list) {
          let css = 'display:none'
          if (item.icon) {
            const x = (item.icon - 1) % 10
            const y = Math.floor((item.icon - 1) / 10)
            css = `background-position:-${x * 50}px -${y * 50}px`
          }

          list.push({
            title: item.title,
            desc: item.desc,
            css,
          })
        }
        helpGroup.push({
          group: group.group,
          list,
        })
      }

      const data = {
        helpCfg: {
          title: helpCfg.title || 'B站帮助',
          subTitle: helpCfg.subTitle || 'Bilibili-Plugin 帮助',
        },
        helpGroup,
      }

      const img = await render('help', 'index', data, 'png')
      if (!img) return e.reply('[B站插件] 帮助图生成失败，请重试。')
      return e.reply(img)
    } catch (err) {
      logger.error('[Bilibili-Plugin] 帮助图生成失败:', err)
      return e.reply('[B站插件] 帮助图生成失败，请重试。')
    }
  }
}
