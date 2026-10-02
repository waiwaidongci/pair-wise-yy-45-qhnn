export type MergeModule = '款式档案' | '样衣评审' | '修订历史'

export type Measurement = {
  key: string
  name: string
  spec: number
  actual: number
  tolerance: number
}

export type Annotation = {
  id: string
  x: number
  y: number
  part: string
  content: string
  author: string
  status: '待处理' | '已解决'
}

export type RevisionProposal = {
  id: string
  author: string
  role: string
  content: string
  affectedPart: string
  status: '待决定' | '已采纳' | '未采纳'
}

export type Sample = {
  id: string
  styleCode: string
  styleName: string
  category: string
  developmentSeason: string
  supplier: string
  dueDate: string
  owner: string
  /** 服务端当前版本号；离线稿只记录基准版本，不直接覆盖该值 */
  version: number
  status: '开发中' | '待审核' | '已锁定'
  fabric: string
  colorway: string
  craft: string[]
  /** 评审草稿跟随样衣一起做版本合并 */
  draftNotes?: string
  measurements: Record<'第一轮' | '第二轮' | '第三轮', Measurement[]>
  annotations: Annotation[]
  proposals: RevisionProposal[]
  attachments: Array<{ name: string; type: string; owner: string }>
  comments: Array<{ id: string; author: string; content: string; date: string }>
}

/** 一次离线操作：带提交人与基准版本，是三方合并的最小单元 */
export type FieldChange = {
  id: string
  sampleId: string
  field: string
  label: string
  module: MergeModule
  oldValue: string
  newValue: string
  /** 列表型字段（如批注）以追加项形式参与合并 */
  appendItem?: Annotation
  /** 附带说明，例如方案采纳/不采纳理由 */
  note?: string
  baseVersion: number
  author: string
  at: string
}

export type ConflictResolution = 'keepServer' | 'useIncoming' | 'custom'

export type ConflictRecord = {
  field: string
  label: string
  module: MergeModule
  baseValue: string
  serverValue: string
  serverAuthor: string
  incomingValue: string
  incomingAuthor: string
  incomingAt: string
  incomingNote?: string
  resolution?: ConflictResolution
  customValue?: string
}

export type AutoMergedRecord = {
  field: string
  label: string
  module: MergeModule
  value: string
  author: string
  at: string
}

export type BlockedRecord = {
  field: string
  label: string
  module: MergeModule
  value: string
  reason: string
}

export type BranchStatus = '待处理' | '已合入' | '已放弃'

export type PendingBranch = {
  id: string
  sampleId: string
  sampleLabel: string
  modules: MergeModule[]
  author: string
  baseVersion: number
  createdAt: string
  failedAt: string
  failReason: string
  /** 基准版本是否早于服务端版本（旧稿） */
  stale: boolean
  serverVersionAtReview: number
  changes: FieldChange[]
  conflicts: ConflictRecord[]
  autoMerged: AutoMergedRecord[]
  blocked: BlockedRecord[]
  status: BranchStatus
  assignee: string
  closeNote?: string
  closedAt?: string
}

export type HistoryFieldRecord = {
  field: string
  label: string
  oldValue: string
  newValue: string
  author?: string
}

export type HistoryKind = '合入' | '同步失败' | '冲突取舍' | '锁定' | '解锁' | '放弃分支' | '历史还原' | '他人提交'

export type HistoryEntry = {
  id: string
  sampleId: string
  version: number
  at: string
  author: string
  module: MergeModule
  kind: HistoryKind
  title: string
  detail: string
  fields: HistoryFieldRecord[]
  /** 该版本落定后的字段快照，供历史还原逐字段取舍 */
  snapshot: Record<string, string>
}
