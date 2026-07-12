# LinkFlow-Plugin / 链流插件

流媒体综合功能插件,目前仅包含B站功能。支持 **UP主动态/直播订阅推送**、**B站激励计划抢奖励**。

## 安装

在 Yunzai 根目录执行：

> Github
```bash
git clone --depth=1 https://github.com/AxiuCN/LinkFlow-Plugin ./plugins/LinkFlow-Plugin/
pnpm install -P --filter LinkFlow-Plugin
```

> Gitee
```bash
git clone --depth=1 https://gitee.com/AxiuCN/LinkFlow-Plugin ./plugins/LinkFlow-Plugin/
pnpm install -P --filter LinkFlow-Plugin
```

## 指令总表

### B站账号

| 指令 | 权限 | 说明 |
|------|------|------|
| `#机器人b站登录` | 主人（私聊） | bot 公共账号扫码绑定（动态/直播推送用） |
| `#机器人b站状态` | 主人 | 查看 bot B站登录态 |
| `#机器人b站登出` | 主人 | 登出并清除 bot Cookie |
| `#b站登录` | 所有人 | 个人账号扫码绑定（激励领取用） |
| `#b站状态` | 所有人 | 查看当前 QQ 个人登录态 |

### 动态订阅

| 指令 | 权限 | 说明 |
|------|------|------|
| `#订阅b站UP动态 <uid>` | 所有人 | 订阅 UP 主动态推送（视频/图文/文章） |
| `#取消b站UP动态 <uid>` | 所有人 | 取消订阅 UP 主动态 |
| `#动态订阅列表` | 所有人 | 查看当前群/个人动态订阅 |

> 💡 指令前加"全体"@全体成员，"匿名"不@自己。

### 直播订阅

| 指令 | 权限 | 说明 |
|------|------|------|
| `#订阅b站UP直播 <uid>` | 所有人 | 按 UID 订阅开播推送 |
| `#订阅b站UP直播间 <id>` | 所有人 | 按房间号订阅开播推送 |
| `#取消b站UP直播 <uid>` | 所有人 | 取消 UP 直播订阅 |
| `#取消b站UP直播间 <id>` | 所有人 | 取消直播间订阅 |
| `#直播订阅列表` | 所有人 | 查看当前群/个人直播订阅 |

> 💡 指令前加"全体"@全体成员，"匿名"不@自己。

### 激励计划

| 指令 | 权限 | 说明 |
|------|------|------|
| `#激励创建配置` | 白名单 | 生成 20 槽位个人配置 |
| `#激励添加 <序号> <链接>` | 白名单 | 填入活动链接（1-10 直播，11-20 看播） |
| `#激励列表` | 白名单 | 查看 20 槽位状态 |
| `#激励删除 <序号>` | 白名单 | 清空指定槽位 |
| `#领取每日激励` | 白名单 | 手动领取每日任务激励 |
| `#领取激励 <间隔> <线程> <持续s> <task_id>` | 白名单 | 持续重试抢单个 task（刚完成任务时用） |
| `#添加激励白名单 @QQ` | 主人 | 添加 QQ 到白名单 |
| `#删除激励白名单 @QQ` | 主人 | 从白名单移除 QQ |
| `#激励白名单` | 主人 | 查看白名单 |

### 通用

| 指令 | 权限 | 说明 |
|------|------|------|
| `#LinkFlow帮助` | 所有人 | 查看帮助图片 |

## 功能特性

- **动态订阅推送**：cron 轮询 UP 主动态，WBI + bili_ticket + 浏览器指纹全套反爬，富文本渲染 HTML 卡片推送到群
- **直播订阅推送**：轮询直播间状态，开播/下播/标题变更自动通知
- **B站激励领取**：每日定时并发抢奖励，支持直播/看播/兜底三种模式，多 Worker 并发
- **双账号体系**：bot 公共账号（动态/直播推送）+ 个人账号（激励领取），Cookie 独立存储互不干扰
- **锅巴配置面板**：按模块拆分（全局/动态订阅/直播订阅/激励），可视化编辑
- **总开关**：`global.enabled = false` 关闭除登录外的所有功能，各模块独立开关可控

## 配置结构

三层配置设计，锅巴后台驱动：

```
defSet/config.yaml                  ← 模板（${变量} 占位符 + 完整注释）
config/config.yaml                  ← 运行时配置（锅巴写入，gitignore）
config/config.yaml.example          ← 参考文件（手动编辑，纳入 git）
```

锅巴面板按模块拆分：**全局设置** / **动态订阅**（cron + 时间窗口 + 推送行为） / **直播订阅**（cron + 下播通知 + 推送行为） / **激励计划**（全部字段）。

## 数据存储

```
data/
├── bot.json               # bot 公共账号 Cookie（动态/直播推送用）
├── accounts/              # 个人账号 Cookie（按 QQ 分文件）
└── subscribe/             # 订阅数据（dynamic_bili.json / live_bili.json）

config/
└── incentive_config/      # 激励个人配置（按 QQ 分文件）+ 白名单
```

## 项目结构

```
LinkFlow-Plugin/
├── index.js               # 入口：配置初始化 + 动态加载 apps/
├── guoba.support.js       # 锅巴入口（委托 guoba/index.js）
├── guoba/                 # 锅巴配置 UI（全局/动态/直播/激励）
├── apps/                  # 指令路由（login/botlogin/dynamic/livepush/incentive/help）
├── model/                 # 数据层（BiliClient + BiliTicket + BiliFingerprint + LiveApi）
├── modules/               # 业务模块（BiliLogin/BotCookie + dynamic/livepush/incentive）
├── components/            # 可复用组件（config/render/constants/Storage/pluginVersion/utils/...）
├── config/                # 运行时配置 + .example（gitignore）
├── defSet/                # 锅巴配置模板
└── resources/             # HTML 模板 + 静态资源（dynamic/incentive/help/qrCode/common）
```

## 免责声明

- 本工具仅供学习交流使用。
- 请遵守各平台用户协议，使用者自行承担一切责任。

## 交流与讨论

如有问题，请加入 QQ 群 **965272093** 交流反馈。

## 鸣谢

- [yuki-plugin](https://github.com/yoimiya-kokomi/yuki-plugin) — 动态订阅反爬链路参考
- [GetLiveAward](https://github.com/yuzeeesama/GetLiveAward) — 激励领取接口参考
- [bililivePush-plugin](https://github.com/HDTianRu/bililivePush-plugin) — 直播推送功能基础
