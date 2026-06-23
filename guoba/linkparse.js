/**
 * guoba/linkparse.js — 链接解析 + 下载 + 群白名单
 *
 * 对应 defSet/config.yaml 模板变量:
 *   linkparse_enabled, linkparse_bilibili_enabled, linkparse_douyin_enabled,
 *   linkparse_tiktok_enabled, linkparse_kuaishou_enabled, linkparse_weibo_enabled,
 *   linkparse_xiaohongshu_enabled, linkparse_xianyu_enabled, linkparse_toutiao_enabled,
 *   linkparse_xiaoheihe_enabled, linkparse_twitter_enabled,
 *   linkparse_download_enabled, linkparse_download_timeout, linkparse_download_maxSize
 *
 * 群白名单独立存储于 config/linkparse_config/whitelist.yaml
 * 锅巴通过 GSubForm 读写该文件，不在 config.yaml 中存储 allowGroups
 */
import path from 'node:path'
import { pluginRoot } from '../components/constants.js'
import { loadWhitelist, saveWhitelist } from '../modules/linkparse/Whitelist.js'

const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

const defaults = {
  linkparse_enabled: 'true',
  linkparse_bilibili_enabled: 'true',
  linkparse_douyin_enabled: 'true',
  linkparse_tiktok_enabled: 'true',
  linkparse_kuaishou_enabled: 'true',
  linkparse_weibo_enabled: 'true',
  linkparse_xiaohongshu_enabled: 'true',
  linkparse_xianyu_enabled: 'true',
  linkparse_toutiao_enabled: 'true',
  linkparse_xiaoheihe_enabled: 'true',
  linkparse_twitter_enabled: 'true',
  linkparse_download_enabled: 'true',
  linkparse_download_timeout: '600',
  linkparse_download_maxSize: '100',
}

export function getSchema() {
  return [
    // ==================== 解析开关 ====================
    { label: '链接解析', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'linkparse.enabled',
      label: '解析总开关',
      helpMessage: '是否自动解析消息中的链接',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    { component: 'Divider', label: '平台开关', componentProps: { orientation: 'left', plain: true } },

    {
      field: 'linkparse.bilibili.enabled',
      label: 'B站解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.douyin.enabled',
      label: '抖音解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.tiktok.enabled',
      label: 'TikTok解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.kuaishou.enabled',
      label: '快手解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.weibo.enabled',
      label: '微博解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.xiaohongshu.enabled',
      label: '小红书解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.xianyu.enabled',
      label: '闲鱼解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.toutiao.enabled',
      label: '头条解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.xiaoheihe.enabled',
      label: '小黑盒解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.twitter.enabled',
      label: 'Twitter解析',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    // ==================== 下载设置 ====================
    { label: '下载设置', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'linkparse.download.enabled',
      label: '下载总开关',
      helpMessage: '解析后是否自动下载视频',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'linkparse.download.timeout',
      label: '下载超时（秒）',
      helpMessage: '单个视频下载超时时间',
      bottomHelpMessage: '默认 600 秒（10分钟）',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 30, max: 3600, defaultValue: 600 },
    },
    {
      field: 'linkparse.download.maxSize',
      label: '最大文件（MB）',
      helpMessage: '超过此大小的视频不下载',
      bottomHelpMessage: '默认 100MB',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 1, max: 2048, defaultValue: 100 },
    },

    // ==================== 群下载白名单 ====================
    { component: 'Divider', label: '群下载白名单', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'linkparse.download.allowGroups',
      label: '允许下载的群号',
      helpMessage: '留空表示所有群均可下载（白名单 enabled=false）',
      bottomHelpMessage: '也可通过群内 #开启解析 / #关闭解析 指令管理',
      component: 'GSubForm',
      componentProps: {
        multiple: true,
        schemas: [
          {
            field: 'groupId',
            label: '群号',
            component: 'Input',
            required: true,
            componentProps: { placeholder: 'QQ群号' },
          },
        ],
      },
    },
  ]
}

export function getDefaults() {
  return defaults
}

export { configPath, defaultConfigPath }
