export const helpCfg = {
  title: '#LinkFlow帮助',
  subTitle: 'LinkFlow-Plugin v2.0.0'
}

export const helpList = [
  {
    group: 'B站账号',
    list: [
      { icon: 1, title: '#机器人b站登录', desc: 'bot主人扫码绑定公共账号' },
      { icon: 1, title: '#b站登录', desc: '扫码绑定个人B站账号' },
      { icon: 80, title: '#b站状态', desc: '查看个人登录态' }
    ]
  },
  {
    group: '动态订阅',
    list: [
      { icon: 71, title: '#订阅b站UP动态 <uid>', desc: '订阅UP主动态推送' },
      { icon: 92, title: '#取消b站UP动态 <uid>', desc: '取消订阅UP主动态' },
      { icon: 80, title: '#动态订阅列表', desc: '查看当前群/个人动态订阅' },
      { icon: 74, title: '前缀', desc: '指令前加"全体"@全体成员，"匿名"不@自己' },
    ]
  },
  {
    group: '直播订阅',
    list: [
      { icon: 71, title: '#订阅b站UP直播 <uid>', desc: '订阅UP主开播推送（按UID）' },
      { icon: 71, title: '#订阅b站UP直播间 <id>', desc: '订阅直播间开播推送（按房间号）' },
      { icon: 92, title: '#取消b站UP直播 <uid>', desc: '取消UP直播订阅' },
      { icon: 92, title: '#取消b站UP直播间 <id>', desc: '取消直播间订阅' },
      { icon: 80, title: '#直播订阅列表', desc: '查看当前群/个人直播订阅' },
      { icon: 74, title: '前缀', desc: '指令前加"全体"@全体成员，"匿名"不@自己' },
    ]
  },
  {
    group: '激励计划',
    list: [
      { icon: 75, title: '#激励创建配置', desc: '生成个人20槽位配置' },
      { icon: 87, title: '#激励添加 <序号> <链接>', desc: '填入槽位（1-10直播，11-20看播）' },
      { icon: 80, title: '#激励列表', desc: '查看20槽位状态' },
      { icon: 92, title: '#激励删除 <序号>', desc: '清空指定槽位' },
      { icon: 69, title: '#领取每日激励', desc: '手动领取每日任务激励' },
      { icon: 69, title: '#领取激励 <间隔> <线程> <持续秒> <task_id>', desc: '手动持续抢激励' }
    ]
  },
  {
    group: '激励管理（仅主人）',
    auth: 'master',
    list: [
      { icon: 31, title: '#添加激励白名单 @QQ', desc: '添加QQ到白名单' },
      { icon: 92, title: '#删除激励白名单 @QQ', desc: '从白名单移除QQ' },
      { icon: 80, title: '#激励白名单', desc: '查看白名单' }
    ]
  },
  {
    group: '链接解析',
    list: [
      { icon: 1, title: '#开启解析 / #关闭解析', desc: '本群链接解析开关（群主/管理）' },
      { icon: 74, title: '自动解析', desc: '发送含链接的消息自动解析（10平台）' },
      { icon: 74, title: '自动下载', desc: '解析后自动下载视频（受配置控制）' },
      { icon: 74, title: '支持平台', desc: 'B站/抖音/TikTok/快手/微博/小红书/闲鱼/头条/小黑盒/Twitter' },
    ]
  },
  {
    group: '通用',
    list: [
      { icon: 1, title: '#LinkFlow帮助', desc: '查看帮助图' },
      { icon: 1, title: '#初始化工具环境', desc: '检查安装BBDown/ffmpeg/aria2/media_parser' }
    ]
  },
  {
    group: 'TIP',
    list: [
      { icon: 1, title: 'Step 1', desc: '#机器人b站登录 → bot主人绑定公共账号' },
      { icon: 1, title: 'Step 2', desc: '#b站登录 → 绑定个人B站账号（激励用）' },
      { icon: 75, title: 'Step 3', desc: '#激励创建配置 → 生成20槽位个人配置' },
      { icon: 87, title: 'Step 4', desc: '#激励添加 <序号> <链接> 填入活动链接' },
      { icon: 80, title: '关于槽位', desc: '1-10直播，11-20看播。按序号从小到大领取' },
      { icon: 74, title: '关于动态', desc: '#订阅b站UP动态 <uid> 订阅后自动轮询推送' },
      { icon: 74, title: '关于解析', desc: '群内发链接自动解析，#开启/关闭解析 控制' },
    ]
  }
]
