import type {
  AutoMergedRecord,
  BlockedRecord,
  ConflictRecord,
  FieldChange,
  HistoryFieldRecord,
  MergeModule,
  Sample,
} from '../api/types'

/**
 * 字段适配器：款式档案 / 样衣评审 / 修订历史共用同一套合并流程，
 * 差异只体现在每个字段如何读取、写回、判断锁定与展示。
 */
export type FieldAdapter = {
  key: string
  label: string
  module: MergeModule
  /** 快照键（批注/方案属于样衣评审） */
  snapshotKey?: string
  read: (sample: Sample) => string
  write?: (sample: Sample, value: string) => void
  /** 受保护（审核锁定的资料 / 已定方案）时不允许旧稿写入 */
  protectedReason?: (sample: Sample) => string | null
  /** 批注型字段：离线改动是“追加一条批注”，按 id 并集合入 */
  appendAnnotation?: boolean
}

const scalar = (
  key: string,
  label: string,
  module: MergeModule,
  read: (sample: Sample) => string,
  write?: (sample: Sample, value: string) => void,
  protectedReason?: (sample: Sample) => string | null,
  snapshotKey?: string,
): FieldAdapter => ({ key, label, module, read, write, protectedReason, snapshotKey: snapshotKey ?? key })

const lockedWhenSampleLocked = (sample: Sample) =>
  sample.status === '已锁定' ? '该样衣已审核锁定，档案资料保留为只读' : null

export const fieldAdapters: FieldAdapter[] = [
  scalar('styleName', '款式名称', '款式档案', (s) => s.styleName, (s, v) => { s.styleName = v }, lockedWhenSampleLocked),
  scalar('supplier', '供应商', '款式档案', (s) => s.supplier, (s, v) => { s.supplier = v }, lockedWhenSampleLocked),
  scalar('owner', '负责人', '款式档案', (s) => s.owner, (s, v) => { s.owner = v }, lockedWhenSampleLocked),
  scalar('fabric', '面辅料', '款式档案', (s) => s.fabric, (s, v) => { s.fabric = v }, lockedWhenSampleLocked),
  scalar('colorway', '色卡', '款式档案', (s) => s.colorway, (s, v) => { s.colorway = v }, lockedWhenSampleLocked),
  scalar('dueDate', '计划交样', '款式档案', (s) => s.dueDate, (s, v) => { s.dueDate = v }, lockedWhenSampleLocked),
  {
    key: 'craft',
    label: '工艺要求',
    module: '款式档案',
    snapshotKey: 'craft',
    read: (s) => s.craft.join('\n'),
    write: (s, v) => { s.craft = v.split('\n').map((item) => item.trim()).filter(Boolean) },
    protectedReason: lockedWhenSampleLocked,
  },
  {
    key: 'annotations',
    label: '样衣批注',
    module: '样衣评审',
    snapshotKey: 'annotations',
    read: (s) => s.annotations.map((a) => `[${a.status}] ${a.part}：${a.content}（${a.author}）`).join('\n'),
    appendAnnotation: true,
    protectedReason: (s) => (s.status === '已锁定' ? '该轮次已审核锁定，批注资料只读' : null),
  },
  scalar('draftNotes', '轮次评审草稿', '样衣评审', (s) => s.draftNotes ?? '', (s, v) => { s.draftNotes = v }),
  // 三个方案各有三个字段，proposal:<id>:<prop>
  ...(['content', 'affectedPart', 'status'] as const).flatMap((prop) =>
    ['RV-01', 'RV-02', 'RV-11'].map((proposalId): FieldAdapter => {
      const proposalLabel: Record<typeof prop, string> = { content: '方案内容', affectedPart: '涉及部位', status: '决定状态' }
      return {
        key: `proposal:${proposalId}:${prop}`,
        label: `${proposalId} ${proposalLabel[prop]}`,
        module: '样衣评审',
        snapshotKey: `proposal:${proposalId}:${prop}`,
        read: (s) => s.proposals.find((p) => p.id === proposalId)?.[prop] ?? '',
        write: (s, v) => {
          const proposal = s.proposals.find((p) => p.id === proposalId)
          if (proposal) {
            if (prop === 'status' && (v === '已采纳' || v === '未采纳' || v === '待决定')) proposal.status = v
            if (prop === 'content') proposal.content = v
            if (prop === 'affectedPart') proposal.affectedPart = v
          }
        },
        protectedReason: (s) => {
          if (s.status === '已锁定') return '轮次已锁定，已定方案照常保留'
          const proposal = s.proposals.find((p) => p.id === proposalId)
          if (proposal && proposal.status !== '待决定' && prop === 'status') {
            return `方案 ${proposalId} 已${proposal.status}，已定决定不被旧稿覆盖`
          }
          return null
        },
      }
    }),
  ),
]

export const adapterByKey = new Map(fieldAdapters.map((adapter) => [adapter.key, adapter]))

export function getAdapter(key: string): FieldAdapter | undefined {
  return adapterByKey.get(key)
}

export function fieldLabel(key: string): string {
  return adapterByKey.get(key)?.label ?? key
}

/** 生成版本快照：历史还原时逐字段比对、逐项取舍 */
export function snapshotOf(sample: Sample): Record<string, string> {
  const snapshot: Record<string, string> = {}
  for (const adapter of fieldAdapters) {
    const snapshotKey = adapter.snapshotKey ?? adapter.key
    snapshot[snapshotKey] = adapter.read(sample)
  }
  return snapshot
}

export type MergeResult = {
  sample: Sample
  /** 是否产生了新的服务端版本 */
  versionBumped: boolean
  conflicts: ConflictRecord[]
  autoMerged: AutoMergedRecord[]
  blocked: BlockedRecord[]
}

/**
 * 三方合并（款式档案 / 样衣评审 / 修订历史共享）：
 * - 基准值与离线新值相同：未改动，跳过
 * - 基准值与服务端现值相同：离线改动可干净快进写入
 * - 服务端也改过但结果与离线稿一致：殊途同归，自动合入
 * - 双方都改且结果不同：同字段冲突，两份内容都保留并写明来源
 * - 审核锁定资料 / 已定方案：受保护，旧稿写入被拦下
 * - 批注按 id 并集追加，双方各加一条互不覆盖
 */
export function runMerge(
  baseSample: Sample,
  changes: FieldChange[],
  options: { serverAuthors?: Record<string, string> },
): MergeResult {
  const sample = structuredClone(baseSample)
  const conflicts: ConflictRecord[] = []
  const autoMerged: AutoMergedRecord[] = []
  const blocked: BlockedRecord[] = []
  let versionBumped = false

  for (const change of changes) {
    const adapter = getAdapter(change.field)

    // 1) 受保护资料：审核锁定 / 已定方案，拒绝旧稿写入
    const protectReason = adapter?.protectedReason?.(sample)
    if (protectReason) {
      blocked.push({
        field: change.field,
        label: adapter?.label ?? change.label,
        module: change.module,
        value: change.newValue,
        reason: protectReason,
      })
      continue
    }

    // 2) 批注：按 id 并集，双方各自追加的批注都保留
    if (adapter?.appendAnnotation && change.appendItem) {
      if (!sample.annotations.some((a) => a.id === change.appendItem!.id)) {
        sample.annotations.push(structuredClone(change.appendItem))
        autoMerged.push({
          field: change.field,
          label: `${change.appendItem.part}批注`,
          module: change.module,
          value: change.appendItem.content,
          author: change.author,
          at: change.at,
        })
        versionBumped = true
      }
      continue
    }

    if (!adapter?.write) continue

    const serverValue = adapter.read(sample)
    if (change.oldValue === change.newValue) continue

    if (change.oldValue === serverValue || serverValue === change.newValue) {
      // 3) 干净快进，或双方改成一致：自动合入
      if (serverValue !== change.newValue) adapter.write(sample, change.newValue)
      autoMerged.push({
        field: change.field,
        label: adapter.label,
        module: change.module,
        value: change.newValue,
        author: change.author,
        at: change.at,
      })
      versionBumped = true
    } else {
      // 4) 同一字段双方都改且不同：冲突，两份都保留并写明来源
      conflicts.push({
        field: change.field,
        label: adapter.label,
        module: change.module,
        baseValue: change.oldValue,
        serverValue,
        serverAuthor: options.serverAuthors?.[change.field] ?? '协作者',
        incomingValue: change.newValue,
        incomingAuthor: change.author,
        incomingAt: change.at,
        incomingNote: change.note,
      })
    }
  }

  if (versionBumped) sample.version += 1
  return { sample, versionBumped, conflicts, autoMerged, blocked }
}

/** 将一次冲突取舍写回样衣；custom 时使用自定义值。版本递增由调用方按流程决定 */
export function applyResolution(sample: Sample, conflict: ConflictRecord): Sample {
  if (conflict.resolution === 'keepServer' || !conflict.resolution) return sample
  const adapter = getAdapter(conflict.field)
  if (!adapter?.write) return sample
  const next = structuredClone(sample)
  adapter.write(next, conflict.resolution === 'custom' ? (conflict.customValue ?? '') : conflict.incomingValue)
  return next
}

/** 比对两个版本快照，找出还原所需的字段差异（仅可写字段；批注属于追加资料，不参与回退） */
export function diffSnapshots(
  from: Record<string, string>,
  to: Record<string, string>,
): HistoryFieldRecord[] {
  const diffs: HistoryFieldRecord[] = []
  for (const adapter of fieldAdapters) {
    const key = adapter.snapshotKey ?? adapter.key
    if (!adapter.write || adapter.appendAnnotation) continue
    const oldValue = from[key] ?? ''
    const newValue = to[key] ?? ''
    if (oldValue !== newValue) {
      diffs.push({ field: adapter.key, label: adapter.label, oldValue, newValue })
    }
  }
  return diffs
}
