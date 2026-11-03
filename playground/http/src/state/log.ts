/**
 * 页面日志与阶段状态：同一份数据既写 console，也渲染到 H5。
 */
import { reactive, ref } from 'vue'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'
export type StageStatus = 'pending' | 'running' | 'ok' | 'fail'

export interface LogEntry {
  id: number
  time: string
  level: LogLevel
  scope: string
  message: string
}

export interface StageEntry {
  label: string
  status: StageStatus
  detail?: string
  at: string
}

const MAX_LOGS = 300

export const logs = ref<LogEntry[]>([])
export const stages = reactive<Record<string, StageEntry>>({})

let seq = 0

export function log(level: LogLevel, scope: string, message: string): void {
  seq += 1
  const entry: LogEntry = {
    id: seq,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    level,
    scope,
    message,
  }
  logs.value = [...logs.value, entry].slice(-MAX_LOGS)

  const text = `[${scope}] ${message}`
  if (level === 'error') console.error(text)
  else if (level === 'warn') console.warn(text)
  else console.log(text)
}

export function clearLogs(): void {
  logs.value = []
}

export function setStage(key: string, label: string, status: StageStatus, detail?: string): void {
  stages[key] = {
    label,
    status,
    detail,
    at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
  }
  log(status === 'fail' ? 'error' : 'info', 'stage', `${label} → ${status}${detail ? `（${detail}）` : ''}`)
}
