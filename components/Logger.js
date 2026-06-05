import fs from 'node:fs'
import path from 'node:path'
import { pluginRoot } from './constants.js'

/** 日志目录 */
const logDir = path.join(pluginRoot, 'logs')

/**
 * 确保日志目录存在
 */
function ensureLogDir() {
  fs.mkdirSync(logDir, { recursive: true })
}

/**
 * 获取当前日期字符串（yyyy-mm-dd）
 */
function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 获取当前时间戳字符串 [yyyy-mm-dd HH:mm:ss]
 */
function timestamp() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `[${y}-${m}-${day} ${hh}:${mm}:${ss}]`
}

/**
 * 写入一行日志到 data/logs/claim_{yyyy-mm-dd}.log
 * @param {string} context - 日志上下文标签，如 "任务"、"领取-提交"
 * @param {string} message
 * @param {string|number} [qq] - 可选，关联 QQ
 */
function writeLog(context, message, qq = '') {
  try {
    ensureLogDir()
    const file = path.join(logDir, `claim_${todayStr()}.log`)
    const qqTag = qq ? `[QQ:${qq}] ` : ''
    const line = `${timestamp()} ${qqTag}[${context}] ${message}\n`
    fs.appendFileSync(file, line, 'utf8')
  } catch (e) {
    logger.error(`[Bilibili-Plugin] 写入日志失败:`, e)
  }
}

/**
 * 任务流程日志
 */
function logTask(msg, qq) { writeLog('任务', msg, qq) }

/**
 * 领取提交结果日志
 */
function logClaim(msg, qq) { writeLog('领取-提交', msg, qq) }

/**
 * Cookie 状态日志
 */
function logCookie(msg, qq) { writeLog('Cookie', msg, qq) }

/**
 * 登录流程日志
 */
function logLogin(msg, qq) { writeLog('登录', msg, qq) }

export { writeLog, logTask, logClaim, logCookie, logLogin, logDir }
