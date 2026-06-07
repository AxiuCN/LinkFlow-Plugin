# Bilibili-Plugin
B站综合功能插件，支持UP主激励计划定时抢奖励、直播推送等功能

## 安装插件
在Yunzai根目录执行命令安装

> Github
```bash
git clone --depth=1 https://github.com/AxiuCN/Bilibili-Plugin ./plugins/Bilibili-Plugin/
pnpm install -P --filter Bilibili-Plugin
```

> Gitee
```bash
git clone --depth=1 https://gitee.com/AxiuCN/Bilibili-Plugin ./plugins/Bilibili-Plugin/
pnpm install -P --filter Bilibili-Plugin
```

## 指令

| 指令 | 权限 | 说明 |
|------|------|------|
| `#b站登录` | 所有人 | 扫码登录B站账号（自动绑定至当前QQ） |
| `#b站状态` | 所有人 | 查看当前QQ的登录状态 |
| `#b站帮助` | 所有人 | 查看帮助图 |
| `#激励创建配置` | 白名单 | 生成个人兑换配置 |
| `#激励添加 <序号> <链接>` | 白名单 | 向个人配置添加兑换链接 |
| `#激励列表` | 白名单 | 查看个人兑换配置 |
| `#激励删除 <序号>` | 白名单 | 删除指定兑换链接 |
| `#激励白名单` | 主人 | 查看激励白名单 |
| `#添加激励白名单` | 主人 | 添加QQ到白名单 |
| `#删除激励白名单` | 主人 | 从白名单移除QQ |

## 定时领取

- **主领取**：每日 `01:00`（可配置）自动执行，使用用户个人配置的链接，并发竞争领取
- **兜底领取**：每日 `23:55`（可配置）自动执行，使用全局 4 个每日任务链接，未领取则自动领取
- 领取结果通过 HTML 图片发送至通知群和个人

## 配置

通过锅巴面板或 `config/config.yaml` 配置：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `claimTime` | `01:00` | 主领取时间 |
| `fallbackTime` | `23:55` | 兜底领取时间 |
| `claimDeadline` | `40` | 主领取截止秒数（0=不限） |
| `dailyTaskLinks` | 空 | 4 个每日兜底任务链接（主人填） |
| `claim.threadCount` | `2` | 并发领取线程数（最小 1） |

---

## 免责声明
* 本工具仅供学习交流使用。
* 请遵守 Bilibili 用户协议，使用者自行承担一切责任。

## 交流与讨论

如有问题，请加入 QQ 群 **965272093** 交流反馈。
