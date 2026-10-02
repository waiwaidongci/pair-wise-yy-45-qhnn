import type { Sample } from '../api/types'

/** 一条叶子路径 -> 新值，例如 `fabric`、`measurements.第三轮.chest.actual`、`annotations.AN-01.content` */
export type ChangeSet = Record<string, unknown>

export type Identity = { name: string; role: string }

/** 一次提交：带提交人与基准版本，离线时进入待同步队列 */
export type PendingOp = {
  id: string
  sampleId: string
  author: string
  role: string
  baseVersion: number
  baseSnapshot: Sample
  changeset: ChangeSet
  summary: string
  status: '待同步' | '已合并' | '已挂起' | '已拒绝'
  createdAt: string
  syncedAt?: string
}

/** 同一字段被两边改动时，保留两份并写明来源 */
export type Conflict = {
  path: string
  label: string
  baseValue: unknown
  currentValue: unknown
  incomingValue: unknown
  currentSource: string
  incomingSource: string
}

/** 审核锁定 / 已定方案：保留当前值，不被覆盖 */
export type Preserved = {
  path: string
  label: string
  currentValue: unknown
  source: string
}

/** 同步失败后留下的待处理分支，可指派责任人、重试或放弃 */
export type PendingBranch = {
  id: string
  sampleId: string
  opId: string
  reason: 'conflict' | 'locked'
  conflicts: Conflict[]
  preserved: Preserved[]
  status: '待处理' | '已重试' | '已放弃'
  assignee: string | null
  createdAt: string
  resolvedAt?: string
  resolution?: Record<string, 'current' | 'incoming'>
}

export type HistoryAction = '提交' | '自动合并' | '冲突挂起' | '锁定' | '解锁' | '还原' | '放弃' | '重试' | '指派' | '采纳'

export type HistoryEntry = {
  id: string
  sampleId: string
  at: string
  by: string
  role: string
  action: HistoryAction
  version?: number
  detail: string
  choices: string[]
}

export type VersionSnapshot = {
  version: number
  at: string
  by: string
  role: string
  summary: string
  snapshot: Sample
}
