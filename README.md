# LinkFlow-Plugin

流媒体聚合解析 + B站综合功能插件。支持 **10 平台链接解析下载**、**UP主动态/直播订阅推送**、**B站激励计划抢奖励**。

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

> [!NOTE]
> 首次启动会自动下载 yt-dlp.exe 到 `tool/yt-dlp/`，用于非 B 站平台的视频解析与下载。

## 指令总表

### B站账号

| 指令 | 权限 | 说明 |
|------|------|------|
| `#机器人b站登录` | 主人 | bot 公共账号扫码绑定（解析/下载用） |
| `#b站登录` | 所有人 | 个人账号扫码绑定（激励领取用） |
| `#b站状态` | 所有人 | 查看当前 QQ 个人登录态 |

### 动态订阅

| 指令 | 权限 | 说明 |
|------|------|------|
| `#订阅b站UP动态 <uid>` | 所有人 | 订阅 UP 主动态推送 |
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

### 链接解析

| 指令 | 权限 | 说明 |
|------|------|------|
| `#开启解析` | 群主/管理 | 本群开启链接解析下载 |
| `#关闭解析` | 群主/管理 | 本群关闭链接解析下载 |

> 💡 群内发送含链接的消息自动触发解析，支持 10 平台：  
> **B站 / 抖音 / TikTok / 快手 / 微博 / 小红书 / 闲鱼 / 头条 / 小黑盒 / Twitter**

### 激励计划

| 指令 | 权限 | 说明 |
|------|------|------|
| `#激励创建配置` | 白名单 | 生成 20 槽位个人配置 |
| `#激励添加 <序号> <链接>` | 白名单 | 填入活动链接（1-10 直播，11-20 看播） |
| `#激励列表` | 白名单 | 查看 20 槽位状态 |
| `#激励删除 <序号>` | 白名单 | 清空指定槽位 |
| `#领取每日激励` | 白名单 | 手动领取每日任务激励 |
| `#添加激励白名单 @QQ` | 主人 | 添加 QQ 到白名单 |
| `#删除激励白名单 @QQ` | 主人 | 从白名单移除 QQ |
| `#激励白名单` | 主人 | 查看白名单 |

### 通用

| 指令 | 权限 | 说明 |
|------|------|------|
| `#linkflow帮助` | 所有人 | 查看帮助图片 |

## 功能特性

- **10 平台链接解析**：B站使用自有 API 深度解析（WBI 签名），其他 9 平台通过 yt-dlp 提取元数据
- **视频自动下载**：解析后自动下载视频（受配置开关、群白名单、大小限制控制）
- **动态订阅推送**：cron 轮询 UP 主动态，去重后渲染 HTML 卡片推送
- **直播订阅推送**：轮询直播间状态，开播/下播/标题变更自动通知
- **B站激励领取**：每日定时并发抢奖励，支持直播/看播/兜底三种模式
- **双账号体系**：bot 公共账号（解析下载）+ 个人账号（激励领取），Cookie 独立存储互不干扰
- **锅巴配置面板**：按模块拆分（全局/链接解析/订阅/激励），可视化编辑
- **群白名单**：独立文件管理解析下载权限，群内 `#开启解析` / `#关闭解析` 即时生效
- **总开关**：`global.enabled = false` 关闭除登录外的所有功能

## 配置结构

三层配置设计，锅巴后台驱动：

```
defSet/config.yaml                  ← 模板（${变量} 占位符 + 完整注释）
config/config.yaml                  ← 运行时配置（锅巴写入，gitignore）
config/config.yaml.example          ← 参考文件（手动编辑，纳入 git）

defSet/linkparse_config/whitelist.yaml   ← 群白名单模板
config/linkparse_config/whitelist.yaml   ← 群白名单运行时
```

锅巴面板按模块拆分：**全局设置** / **链接解析**（10 平台开关 + 下载设置 + 群白名单） / **动态/直播订阅**（cron + 推送行为） / **激励计划**（全部字段）。

## 数据存储

```
data/
├── bot_accounts/          # bot 公共账号 Cookie
├── accounts/              # 个人账号 Cookie（按 QQ 分文件）
├── subscribe/             # 订阅数据 + 去重标记
└── download_cache/        # 视频下载缓存

config/
├── incentive_config/      # 激励个人配置（按 QQ 分文件）+ 白名单
└── linkparse_config/      # 群解析白名单
```

## 项目结构

```
LinkFlow-Plugin/
├── index.js               # 入口：配置初始化 + 动态加载 apps/
├── guoba.support.js       # 锅巴入口（委托 guoba/index.js）
├── guoba/                 # 锅巴配置 UI（按模块拆分）
├── apps/                  # 指令路由（login/subscribe/linkparse/incentive/help）
├── model/                 # 数据层（bilibili API + yt-dlp 封装 + 直播 API）
├── modules/               # 业务模块（subscribe/linkparse/incentive/livepush）
├── components/            # 可复用组件（config/render/constants/utils/...）
├── config/                # 运行时配置（gitignore）
├── defSet/                # 锅巴配置模板
├── resources/             # HTML 模板 + 静态资源
└── tool/                  # 外部工具（yt-dlp）
```

## 免责声明

- 本工具仅供学习交流使用。
- 请遵守各平台用户协议，使用者自行承担一切责任。

## 交流与讨论

如有问题，请加入 QQ 群 **965272093** 交流反馈。

## 鸣谢

- [GetLiveAward](https://github.com/yuzeeesama/GetLiveAward) — 激励领取接口参考
- [bililivePush-plugin](https://github.com/HDTianRu/bililivePush-plugin) — 直播推送功能基础
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — 多平台视频解析下载引擎
