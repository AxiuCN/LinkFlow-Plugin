export const helpCfg = {
  title: '#b站帮助',
  subTitle: 'Bilibili-Plugin 帮助'
}

export const helpList = [
  {
    group: 'B站账号',
    list: [
      { icon: 1, title: '#b站登录', desc: '扫码登录B站账号' },
      { icon: 80, title: '#b站状态', desc: '查看登录状态' }
    ]
  },
  {
    group: '激励计划',
    list: [
      { icon: 75, title: '#激励创建配置', desc: '生成个人配置' },
      { icon: 87, title: '#激励添加 <序号> <链接>', desc: '填入槽位（1-20）' },
      { icon: 80, title: '#激励列表', desc: '查看20槽位状态（直播+看播）' },
      { icon: 92, title: '#激励删除 <序号>', desc: '清空指定槽位（1-20）' },
      { icon: 69, title: '#领取每日激励', desc: '手动领取每日任务激励' }
    ]
  },
  {
    group: '激励管理（仅主人）',
    auth: 'master',
    list: [
      { icon: 31, title: '#添加激励白名单', desc: '添加QQ到白名单' },
      { icon: 92, title: '#删除激励白名单', desc: '从白名单移除QQ' },
      { icon: 80, title: '#激励白名单', desc: '查看白名单' }
    ]
  },
  {
    group: '通用',
    list: [
      { icon: 1, title: '#b站帮助', desc: '查看帮助图' }
    ]
  }
]
