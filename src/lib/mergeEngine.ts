import type { Sample } from '../api/types'
import type { ChangeSet, Conflict, Preserved } from '../features/collabTypes'

export const SCALAR_FIELDS = [
  'styleCode',
  'styleName',
  'category',
  'developmentSeason',
  'supplier',
  'dueDate',
  'owner',
  'status',
  'fabric',
  'colorway',
] as const

export const ROUNDS = ['第一轮', '第二轮', '第三轮'] as const

const FIELD_LABELS: Record<string, string> = {
  spec: '规格',
  actual: '实测',
  tolerance: '容差',
  content: '内容',
  part: '部位',
  status: '状态',
  author: '提交人',
  x: '横向位置',
  y: '纵向位置',
  type: '类型',
  owner: '归属',
  styleCode: '款号',
  styleName: '品名',
  category: '品类',
  developmentSeason: '季节',
  supplier: '供应商',
  dueDate: '交期',
  fabric: '面料',
  colorway: '色卡',
  craft: '工艺',
}

const MEASUREMENT_NAMES: Record<string, string> = {
  chest: '胸围',
  waist: '腰围',
  hem: '下摆围',
  length: '后衣长',
  shoulder: '肩宽',
  sleeve: '袖长',
}

const COLLECTION_LABELS: Record<string, string> = {
  annotations: '批注',
  proposals: '方案',
  comments: '评论',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

export function labelFor(path: string): string {
  const [root, ...rest] = path.split('.')
  if (root === 'measurements') {
    const [round, mkey, field] = rest
    return `${round}·${MEASUREMENT_NAMES[mkey] ?? mkey}·${fieldLabel(field)}`
  }
  if (root === 'annotations' || root === 'proposals' || root === 'comments') {
    const [id, field] = rest
    return `${COLLECTION_LABELS[root]} ${id}·${fieldLabel(field)}`
  }
  if (root === 'attachments') {
    const [name, field] = rest
    return `附件 ${name}·${fieldLabel(field)}`
  }
  return fieldLabel(root)
}

export function stringifyVal(v: unknown): string {
  if (v === undefined || v === null) return '空'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 把样衣文档拍平成 叶子路径 -> 值，便于按字段做三路合并 */
export function flattenSample(doc: Sample): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of SCALAR_FIELDS) out[f] = doc[f]
  out.craft = doc.craft
  for (const round of ROUNDS) {
    for (const m of doc.measurements[round]) {
      for (const field of ['spec', 'actual', 'tolerance'] as const) {
        out[`measurements.${round}.${m.key}.${field}`] = m[field]
      }
    }
  }
  for (const collection of ['annotations', 'proposals', 'comments'] as const) {
    for (const item of doc[collection]) {
      for (const [k, v] of Object.entries(item)) {
        if (k === 'id') continue
        out[`${collection}.${item.id}.${k}`] = v
      }
    }
  }
  for (const att of doc.attachments) {
    out[`attachments.${att.name}.type`] = att.type
    out[`attachments.${att.name}.owner`] = att.owner
  }
  return out
}

/** 按叶子路径写回样衣文档；数组项按 id 归并，新增项自动建立 */
export function setPath(doc: Sample, path: string, value: unknown): void {
  const parts = path.split('.')
  const root = parts[0]
  if (root === 'measurements') {
    const [, round, mkey, field] = parts
    const m = doc.measurements[round as (typeof ROUNDS)[number]]?.find((x) => x.key === mkey)
    if (m) (m as Record<string, unknown>)[field] = value
  } else if (root === 'annotations' || root === 'proposals' || root === 'comments') {
    const [, id, field] = parts
    const arr = doc[root] as Array<Record<string, unknown>>
    let obj = arr.find((x) => x.id === id)
    if (!obj) {
      obj = { id }
      arr.push(obj)
    }
    obj[field] = value
  } else if (root === 'attachments') {
    const [, name, field] = parts
    let att = doc.attachments.find((x) => x.name === name)
    if (!att) {
      att = { name, type: '', owner: '' }
      doc.attachments.push(att)
    }
    ;(att as Record<string, unknown>)[field] = value
  } else {
    ;(doc as Record<string, unknown>)[root] = value
  }
}

export function applyChangeset(doc: Sample, changeset: ChangeSet): void {
  for (const [path, value] of Object.entries(changeset)) setPath(doc, path, value)
}

export type MergeOptions = {
  locked: boolean
  decidedProposalIds: Set<string>
}

export type MergeSources = { current: string; incoming: string }

export type MergeResult = {
  autoMerged: string[]
  conflicts: Conflict[]
  preserved: Preserved[]
}

function isDecidedProposalField(path: string, decidedIds: Set<string>): boolean {
  if (!path.startsWith('proposals.')) return false
  const id = path.split('.')[1]
  return decidedIds.has(id)
}

/**
 * 三路合并：base = 基准版本快照，current = 当前版本，incoming = 本次提交的变更集。
 * - 当前方未改动的字段：自动合入 incoming
 * - 双方都改且值相同：视为一致，自动合入
 * - 同一字段双方都改且值不同：留两份（conflict），写明来源
 * - 审核锁定 / 已定方案：保留当前值（preserved），不覆盖
 */
export function threeWayMerge(
  base: Record<string, unknown>,
  current: Record<string, unknown>,
  incoming: ChangeSet,
  opts: MergeOptions,
  sources: MergeSources,
): MergeResult {
  const autoMerged: string[] = []
  const conflicts: Conflict[] = []
  const preserved: Preserved[] = []

  for (const [path, incomingValue] of Object.entries(incoming)) {
    if (opts.locked) {
      preserved.push({ path, label: labelFor(path), currentValue: current[path], source: sources.current })
      continue
    }
    if (isDecidedProposalField(path, opts.decidedProposalIds)) {
      preserved.push({ path, label: labelFor(path), currentValue: current[path], source: sources.current })
      continue
    }
    const baseValue = base[path]
    const currentValue = current[path]
    if (currentValue === undefined || currentValue === baseValue) {
      autoMerged.push(path)
    } else if (currentValue === incomingValue) {
      autoMerged.push(path)
    } else {
      conflicts.push({
        path,
        label: labelFor(path),
        baseValue,
        currentValue,
        incomingValue,
        currentSource: sources.current,
        incomingSource: sources.incoming,
      })
    }
  }

  return { autoMerged, conflicts, preserved }
}

/** 还原用：只回退标量与尺寸实测字段，不动批注 / 方案 / 评论等协同记录 */
export function diffScalarAndMeasurements(from: Sample, to: Sample): ChangeSet {
  const a = flattenSample(from)
  const b = flattenSample(to)
  const out: ChangeSet = {}
  for (const [path, bv] of Object.entries(b)) {
    if (
      path.startsWith('annotations.') ||
      path.startsWith('proposals.') ||
      path.startsWith('comments.') ||
      path.startsWith('attachments.')
    ) {
      continue
    }
    if (a[path] !== bv) out[path] = bv
  }
  return out
}
