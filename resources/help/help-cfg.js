export const helpCfg = {
  title: '#LinkFlow帮助',
  subTitle: '链流插件 v2.0.0'
}

export const helpList = [
  {
    group: 'B站账号',
    list: [
      { title: '#b站登录', desc: '扫码绑定个人B站账号（激励用）' },
      { title: '#b站状态', desc: '查看个人登录态' },
    ]
  },
  {
    group: 'B站账号（机器人）',
    auth: 'master',
    list: [
      { title: '#机器人b站登录', desc: '扫码绑定Bot公共B站账号（动态/解析用）' },
      { title: '#机器人b站状态', desc: '查看Bot B站登录态' },
      { title: '#机器人b站登出', desc: '登出并清除Bot Cookie' },
    ]
  },
  {
    group: '动态订阅',
    list: [
      { title: '#订阅b站UP动态 <uid>', desc: '订阅UP主动态推送（视频/图文/文章）' },
      { title: '#取消b站UP动态 <uid>', desc: '取消UP动态订阅' },
      { title: '#动态订阅列表', desc: '查看当前群/个人动态订阅' },
      { title: '前缀', desc: '指令前加"全体"@全体成员，"匿名"不@自己' },
    ]
  },
  {
    group: '直播订阅',
    list: [
      { title: '#订阅b站UP直播 <uid>', desc: '订阅UP主开播推送（按UID）' },
      { title: '#订阅b站UP直播间 <id>', desc: '订阅直播间开播推送（按房间号）' },
      { title: '#取消b站UP直播 <uid>', desc: '取消UP直播订阅' },
      { title: '#取消b站UP直播间 <id>', desc: '取消直播间订阅' },
      { title: '#直播订阅列表', desc: '查看当前群/个人直播订阅' },
      { title: '前缀', desc: '指令前加"全体"@全体成员，"匿名"不@自己' },
    ]
  },
  {
    group: '激励计划',
    list: [
      { title: '#激励创建配置', desc: '生成个人20槽位配置' },
      { title: '#激励添加 <序号> <链接>', desc: '填入槽位（1-10直播，11-20看播）' },
      { title: '#激励列表', desc: '查看20槽位状态' },
      { title: '#激励删除 <序号>', desc: '清空指定槽位' },
      { title: '#领取每日激励', desc: '手动领取每日任务激励' },
      { title: '#领取激励 <间隔> <线程> <持续秒> <task_id>', desc: '手动持续抢激励' },
    ]
  },
  {
    group: '激励管理（仅主人）',
    auth: 'master',
    list: [
      { title: '#添加激励白名单 @QQ', desc: '添加QQ到白名单' },
      { title: '#删除激励白名单 @QQ', desc: '从白名单移除QQ' },
      { title: '#激励白名单', desc: '查看白名单' },
    ]
  },
  {
    group: '通用',
    list: [
      { title: '#LinkFlow帮助', desc: '查看帮助图' },
    ]
  },
  {
    group: 'TIP',
    list: [
      { title: 'Step 1', desc: '#b站登录 → 绑定个人B站账号（激励用）' },
      { title: 'Step 2', desc: '#机器人b站登录 → 绑定Bot B站账号（动态/直播用）' },
      { title: 'Step 3', desc: '#激励创建配置 → 生成20槽位个人配置' },
      { title: 'Step 4', desc: '#激励添加 <序号> <链接> 填入活动链接' },
      { title: '关于槽位', desc: '1-10直播，11-20看播。按序号从小到大领取' },
      { title: '关于动态', desc: '#订阅b站UP动态 <uid> 订阅后自动轮询推送UP主动态' },
      { title: '关于直播', desc: '#订阅b站UP直播 <uid> 订阅后自动轮询推送开播' },
      { title: '关于手动抢', desc: '#领取激励 可手动指定线程数和间隔抢激励' },
    ]
  }
]
