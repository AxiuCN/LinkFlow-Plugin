/**
 * guoba/tool.js — 外部工具管理
 *
 * 对应 defSet/config.yaml 模板变量:
 *   tool_autoInstall, tool_bbdown_enabled, tool_bbdown_useAria2,
 *   tool_bbdown_resolution, tool_ffmpeg_enabled, tool_aria2_enabled,
 *   tool_mediaParser_enabled, tool_mediaParser_pythonPath, tool_mediaParser_port
 */
import path from 'node:path'
import { pluginRoot } from '../components/constants.js'

const configPath = path.join(pluginRoot, 'config', 'config.yaml')
const defaultConfigPath = path.join(pluginRoot, 'defSet', 'config.yaml')

const defaults = {
  tool_autoInstall: 'true',
  tool_bbdown_enabled: 'true',
  tool_bbdown_useAria2: 'false',
  tool_bbdown_resolution: '',
  tool_ffmpeg_enabled: 'true',
  tool_aria2_enabled: 'true',
  tool_mediaParser_enabled: 'true',
  tool_mediaParser_pythonPath: 'python',
  tool_mediaParser_port: '19810',
}

export function getSchema() {
  return [
    // ==================== 工具管理 ====================
    { label: '工具管理', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'tool.autoInstall',
      label: '自动安装',
      helpMessage: '启动时自动检查并安装缺失的工具',
      bottomHelpMessage: '首次启动建议开启，手动管理时关闭',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    // ==================== BBDown ====================
    { component: 'Divider', label: 'BBDown（B站下载）', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'tool.bbdown.enabled',
      label: '启用 BBDown',
      helpMessage: 'B站视频下载使用 BBDown',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'tool.bbdown.useAria2',
      label: '使用 aria2 加速',
      helpMessage: 'BBDown 调用 aria2 做多线程下载',
      bottomHelpMessage: '需启用下方 aria2 工具',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: false },
    },
    {
      field: 'tool.bbdown.resolution',
      label: '画质优先级',
      helpMessage: 'BBDown --dfn-priority 参数值',
      bottomHelpMessage: '留空由 BBDown 自动选择，可选值: 8K 超高清/4K 超清/1080P 高码率/1080P 高清/720P 普清',
      component: 'Input',
      required: true,
      componentProps: { placeholder: '留空自动选择' },
    },

    // ==================== ffmpeg ====================
    { component: 'Divider', label: 'ffmpeg（音视频合并）', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'tool.ffmpeg.enabled',
      label: '启用 ffmpeg',
      helpMessage: 'DASH/M3U8 流合并需要 ffmpeg',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    // ==================== aria2 ====================
    { component: 'Divider', label: 'aria2（多线程加速）', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'tool.aria2.enabled',
      label: '启用 aria2',
      helpMessage: 'BBDown 可调用 aria2 加速下载',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },

    // ==================== media_parser ====================
    { component: 'Divider', label: 'media_parser（非B站解析下载）', componentProps: { orientation: 'left', plain: true } },
    {
      field: 'tool.mediaParser.enabled',
      label: '启用 media_parser',
      helpMessage: '非B站平台（抖音/快手/微博等）的解析和下载',
      bottomHelpMessage: '关闭后非B站平台将无法解析，B站不受影响',
      component: 'Switch',
      required: true,
      componentProps: { defaultValue: true },
    },
    {
      field: 'tool.mediaParser.pythonPath',
      label: 'Python 路径',
      helpMessage: 'Python 3.9+ 可执行文件路径或命令名',
      bottomHelpMessage: '默认 "python"，支持绝对路径如 "C:/Python39/python.exe"',
      component: 'Input',
      required: true,
      componentProps: { placeholder: 'python' },
    },
    {
      field: 'tool.mediaParser.port',
      label: '服务端口',
      helpMessage: 'media_parser HTTP 服务监听端口',
      bottomHelpMessage: '默认 19810，端口冲突时修改',
      component: 'InputNumber',
      required: true,
      componentProps: { min: 1024, max: 65535, defaultValue: 19810 },
    },
  ]
}

export function getDefaults() {
  return defaults
}

export { configPath, defaultConfigPath }
