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
    group: '直播推送',
    list: [
      { icon: 71, title: '#订阅直播 <room_id>', desc: '订阅B站直播间开播推送' },
      { icon: 71, title: '#订阅UP <uid>', desc: '订阅B站UP主开播推送' },
      { icon: 92, title: '#取消订阅直播 <room_id>', desc: '取消订阅B站直播间' },
      { icon: 92, title: '#取消订阅UP <uid>', desc: '取消订阅B站UP主' },
      { icon: 80, title: '#本群订阅列表', desc: '查看本群直播订阅' },
      { icon: 80, title: '#我的订阅列表', desc: '查看个人直播订阅' },
      { icon: 74, title: '前缀', desc: '指令前加"全体"@全体，"匿名"不@自己' },
    ]
  },
  {
    group: '通用',
    list: [
      { icon: 1, title: '#b站帮助', desc: '查看帮助图' }
    ]
  },
  {
    group: 'TIP',
    list: [
      { icon: 1, title: 'Step 1', desc: '#b站登录 → 绑定B站账号' },
      { icon: 75, title: 'Step 2', desc: '#激励创建配置 → 生成20槽位个人配置' },
      { icon: 87, title: 'Step 3', desc: '#激励添加 <序号> <链接> 填入活动' },
      { icon: 80, title: '关于槽位', desc: '1-10直播，11-20看播。按序号从小到大领取，优先放重要的' },
      { icon: 69, title: 'Step 4', desc: '#领取每日激励 → 手动领取每日任务奖励' },
      { icon: 92, title: '关于每日任务', desc: '主人配置的全局链接，非20槽位，23:55自动兜底' },
    ]
  }
]
