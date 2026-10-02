import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { seedSamples } from '../api/seed'
import type { Sample } from '../api/types'
import {
  applyChangeset,
  diffScalarAndMeasurements,
  flattenSample,
  labelFor,
  setPath,
  stringifyVal,
  threeWayMerge,
} from '../lib/mergeEngine'
import type {
  ChangeSet,
  HistoryEntry,
  Identity,
  PendingBranch,
  PendingOp,
  VersionSnapshot,
} from './collabTypes'

type Decision = { proposalId: string; decision: '已采纳' | '未采纳'; reason: string; decidedAt: string }

type FieldSource = { by: string; role: string; at: string }

type DevelopmentState = {
  samples: Sample[]
  versions: Record<string, VersionSnapshot[]>
  fieldSources: Record<string, Record<string, FieldSource>>
  selectedId: string
  roundA: '第一轮' | '第二轮' | '第三轮'
  roundB: '第一轮' | '第二轮' | '第三轮'
  decisions: Decision[]
  draftNotes: Record<string, string>
  activeAnnotation: string | null
  currentUser: Identity
  offline: boolean
  outbox: PendingOp[]
  branches: PendingBranch[]
  history: HistoryEntry[]
  syncCenterOpen: boolean
  syncCenterSample: string | null
}

export const persistKey = 'garment-sampling-collab-v1'

function now(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function seedState(): DevelopmentState {
  const samples = structuredClone(seedSamples)
  const versions: Record<string, VersionSnapshot[]> = {}
  const fieldSources: Record<string, Record<string, FieldSource>> = {}
  for (const s of samples) {
    versions[s.id] = [
      { version: 1, at: '2026-09-20 09:00', by: '系统', role: '初始化', summary: '建立款式档案', snapshot: structuredClone(s) },
    ]
    const flat = flattenSample(s)
    const sources: Record<string, FieldSource> = {}
    for (const path of Object.keys(flat)) sources[path] = { by: '系统', role: '初始化', at: '2026-09-20 09:00' }
    fieldSources[s.id] = sources
  }
  return {
    samples,
    versions,
    fieldSources,
    selectedId: samples[0].id,
    roundA: '第二轮',
    roundB: '第三轮',
    decisions: [],
    draftNotes: {},
    activeAnnotation: null,
    currentUser: { name: '沈岚', role: '产品开发' },
    offline: false,
    outbox: [],
    branches: [],
    history: [
      {
        id: 'H-INIT',
        sampleId: samples[0].id,
        at: '2026-09-20 09:00',
        by: '系统',
        role: '初始化',
        action: '提交',
        version: 1,
        detail: '款式档案建立，含尺寸、批注与方案初稿。',
        choices: [],
      },
    ],
    syncCenterOpen: false,
    syncCenterSample: null,
  }
}

const saved = localStorage.getItem(persistKey)
const initialState: DevelopmentState = saved ? (JSON.parse(saved) as DevelopmentState) : seedState()

function pushHistory(
  state: DevelopmentState,
  entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: string },
) {
  state.history.unshift({ id: makeId('H'), at: entry.at ?? now(), ...entry })
}

function sourceLabel(state: DevelopmentState, sampleId: string, path: string): string {
  const s = state.fieldSources[sampleId]?.[path]
  return s ? `${s.by} / ${s.role}` : '系统 / 初始化'
}

function recordVersion(state: DevelopmentState, sample: Sample, by: string, role: string, summary: string) {
  state.versions[sample.id] ??= []
  state.versions[sample.id].push({
    version: sample.version,
    at: now(),
    by,
    role,
    summary,
    snapshot: structuredClone(sample),
  })
}

function applyPaths(
  state: DevelopmentState,
  sample: Sample,
  paths: string[],
  from: { changeset: ChangeSet; by: string; role: string },
) {
  state.fieldSources[sample.id] ??= {}
  for (const path of paths) {
    setPath(sample, path, from.changeset[path])
    state.fieldSources[sample.id][path] = { by: from.by, role: from.role, at: now() }
  }
}

/** 同步一个待提交操作：三路合并，未冲突自动合入，冲突/锁定留待处理分支 */
function syncOp(state: DevelopmentState, op: PendingOp) {
  const sample = state.samples.find((s) => s.id === op.sampleId)
  if (!sample) {
    op.status = '已拒绝' as PendingOp['status']
    return
  }
  const base = flattenSample(op.baseSnapshot)
  const current = flattenSample(sample)
  const decidedIds = new Set(sample.proposals.filter((p) => p.status !== '待决定').map((p) => p.id))
  const result = threeWayMerge(
    base,
    current,
    op.changeset,
    { locked: sample.status === '已锁定', decidedProposalIds: decidedIds },
    { current: sourceLabel(state, sample.id, ''), incoming: `${op.author} / ${op.role}` },
  )
  // current 来源按路径取最近一次写入者
  for (const c of result.conflicts) c.currentSource = sourceLabel(state, sample.id, c.path)
  for (const p of result.preserved) p.source = sourceLabel(state, sample.id, p.path)

  const applied = result.autoMerged.length > 0
  if (applied) {
    applyPaths(state, sample, result.autoMerged, { changeset: op.changeset, by: op.author, role: op.role })
    sample.version += 1
    recordVersion(state, sample, op.author, op.role, op.summary)
  }

  if (result.conflicts.length > 0 || result.preserved.length > 0) {
    const branch: PendingBranch = {
      id: makeId('BR'),
      sampleId: sample.id,
      opId: op.id,
      reason: result.conflicts.length > 0 ? 'conflict' : 'locked',
      conflicts: result.conflicts,
      preserved: result.preserved,
      status: '待处理',
      assignee: null,
      createdAt: now(),
    }
    state.branches.unshift(branch)
    op.status = '已挂起'
    const choices = [
      ...result.conflicts.map((c) => `冲突「${c.label}」：${c.currentSource} 与 ${c.incomingSource} 各留一份，待指派取舍`),
      ...result.preserved.map((p) => `保留「${p.label}」的当前值（审核锁定 / 已定方案）`),
    ]
    pushHistory(state, {
      sampleId: sample.id,
      by: op.author,
      role: op.role,
      action: '冲突挂起',
      version: sample.version,
      detail: applied
        ? `「${op.summary}」未冲突部分已自动合入 v${sample.version}；${result.conflicts.length} 处冲突、${result.preserved.length} 处锁定内容已生成待处理分支。`
        : `「${op.summary}」因审核锁定未合入，已生成待处理分支。`,
      choices,
    })
  } else {
    op.status = '已合并'
    op.syncedAt = now()
    pushHistory(state, {
      sampleId: sample.id,
      by: op.author,
      role: op.role,
      action: '自动合并',
      version: sample.version,
      detail: `「${op.summary}」已合并入 v${sample.version}（基准 v${op.baseVersion}）。`,
      choices: result.autoMerged.map((p) => `「${labelFor(p)}」采用 ${op.author} / ${op.role}`),
    })
  }
}

const slice = createSlice({
  name: 'development',
  initialState,
  reducers: {
    selectSample(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
      state.activeAnnotation = null
    },
    setRounds(state, action: PayloadAction<{ a?: DevelopmentState['roundA']; b?: DevelopmentState['roundB'] }>) {
      if (action.payload.a) state.roundA = action.payload.a
      if (action.payload.b) state.roundB = action.payload.b
    },
    setCurrentUser(state, action: PayloadAction<Identity>) {
      state.currentUser = action.payload
    },
    setOffline(state, action: PayloadAction<boolean>) {
      state.offline = action.payload
      if (!action.payload) {
        const pending = state.outbox.filter((op) => op.status === '待同步').reverse()
        for (const op of pending) syncOp(state, op)
      }
    },
    /** 提交一次变更：带提交人与基准版本；离线入队，在线立即合并 */
    commitEdit(state, action: PayloadAction<{ sampleId: string; changeset: ChangeSet; summary: string }>) {
      const sample = state.samples.find((s) => s.id === action.payload.sampleId)
      if (!sample) return
      const op: PendingOp = {
        id: makeId('OP'),
        sampleId: sample.id,
        author: state.currentUser.name,
        role: state.currentUser.role,
        baseVersion: sample.version,
        baseSnapshot: structuredClone(sample),
        changeset: action.payload.changeset,
        summary: action.payload.summary,
        status: '待同步',
        createdAt: now(),
      }
      state.outbox.unshift(op)
      pushHistory(state, {
        sampleId: sample.id,
        by: state.currentUser.name,
        role: state.currentUser.role,
        action: '提交',
        version: sample.version,
        detail: `${state.offline ? '离线' : '在线'}提交「${action.payload.summary}」，基准 v${sample.version}。`,
        choices: Object.entries(action.payload.changeset).map(([p, v]) => `「${labelFor(p)}」→ ${stringifyVal(v)}`),
      })
      if (!state.offline) syncOp(state, op)
    },
    /** 手动同步全部待提交操作（按提交先后 FIFO 合并） */
    syncOutbox(state) {
      const pending = state.outbox.filter((op) => op.status === '待同步').reverse()
      for (const op of pending) syncOp(state, op)
    },
    /** 采纳 / 未采纳方案：走统一提交流程 */
    decideProposal(
      state,
      action: PayloadAction<{ proposalId: string; decision: '已采纳' | '未采纳'; reason: string; decidedAt: string }>,
    ) {
      const sample = state.samples.find((s) => s.id === state.selectedId)
      if (!sample) return
      const proposal = sample.proposals.find((p) => p.id === action.payload.proposalId)
      if (!proposal || proposal.status !== '待决定') return
      state.decisions.push({
        proposalId: action.payload.proposalId,
        decision: action.payload.decision,
        reason: action.payload.reason,
        decidedAt: action.payload.decidedAt,
      })
      const changeset: ChangeSet = { [`proposals.${proposal.id}.status`]: action.payload.decision }
      // 复用 commitEdit 的入队 / 合并逻辑
      slice.caseReducers.commitEdit(state, {
        type: 'commitEdit',
        payload: { sampleId: sample.id, changeset, summary: `方案「${proposal.affectedPart}」${action.payload.decision}` },
      })
    },
    saveDraft(state, action: PayloadAction<{ sampleId: string; notes: string }>) {
      state.draftNotes[action.payload.sampleId] = action.payload.notes
    },
    toggleAnnotation(state, action: PayloadAction<string | null>) {
      state.activeAnnotation = action.payload
    },
    resolveAnnotation(state, action: PayloadAction<{ sampleId: string; annotationId: string }>) {
      const sample = state.samples.find((s) => s.id === action.payload.sampleId)
      const annotation = sample?.annotations.find((a) => a.id === action.payload.annotationId)
      if (!annotation) return
      const next = annotation.status === '待处理' ? '已解决' : '待处理'
      slice.caseReducers.commitEdit(state, {
        type: 'commitEdit',
        payload: {
          sampleId: action.payload.sampleId,
          changeset: { [`annotations.${annotation.id}.status`]: next },
          summary: `批注「${annotation.part}」标记为${next}`,
        },
      })
    },
    /** 处理待处理分支：按冲突逐项取舍 */
    resolveBranch(
      state,
      action: PayloadAction<{ branchId: string; resolution: Record<string, 'current' | 'incoming'> }>,
    ) {
      const branch = state.branches.find((b) => b.id === action.payload.branchId)
      if (!branch || branch.status !== '待处理') return
      const sample = state.samples.find((s) => s.id === branch.sampleId)
      if (!sample) return
      const op = state.outbox.find((o) => o.id === branch.opId)
      const choices: string[] = []
      for (const c of branch.conflicts) {
        const choice = action.payload.resolution[c.path] ?? 'current'
        if (choice === 'incoming' && op) {
          setPath(sample, c.path, c.incomingValue)
          state.fieldSources[sample.id] ??= {}
          state.fieldSources[sample.id][c.path] = { by: op.author, role: op.role, at: now() }
          choices.push(`「${c.label}」采用 ${op.author} / ${op.role} 的版本`)
        } else {
          choices.push(`「${c.label}」保留当前版本（${c.currentSource}）`)
        }
      }
      if (branch.conflicts.length > 0) {
        sample.version += 1
        recordVersion(state, sample, state.currentUser.name, state.currentUser.role, `处理分支 ${branch.id}`)
      }
      branch.status = '已重试'
      branch.resolvedAt = now()
      branch.resolution = action.payload.resolution
      if (op) {
        op.status = '已合并'
        op.syncedAt = now()
      }
      pushHistory(state, {
        sampleId: sample.id,
        by: state.currentUser.name,
        role: state.currentUser.role,
        action: '采纳',
        version: sample.version,
        detail: `已处理待处理分支，${choices.length} 项冲突完成取舍。`,
        choices,
      })
    },
    /** 重试待处理分支：按当前版本重新合并 */
    retryBranch(state, action: PayloadAction<string>) {
      const branch = state.branches.find((b) => b.id === action.payload)
      if (!branch || branch.status !== '待处理') return
      const op = state.outbox.find((o) => o.id === branch.opId)
      const sample = state.samples.find((s) => s.id === branch.sampleId)
      if (!op || !sample) return
      const base = flattenSample(op.baseSnapshot)
      const current = flattenSample(sample)
      const decidedIds = new Set(sample.proposals.filter((p) => p.status !== '待决定').map((p) => p.id))
      const result = threeWayMerge(
        base,
        current,
        op.changeset,
        { locked: sample.status === '已锁定', decidedProposalIds: decidedIds },
        { current: sourceLabel(state, sample.id, ''), incoming: `${op.author} / ${op.role}` },
      )
      for (const c of result.conflicts) c.currentSource = sourceLabel(state, sample.id, c.path)
      for (const p of result.preserved) p.source = sourceLabel(state, sample.id, p.path)
      branch.conflicts = result.conflicts
      branch.preserved = result.preserved
      if (result.conflicts.length === 0 && result.preserved.length === 0) {
        applyPaths(state, sample, result.autoMerged, { changeset: op.changeset, by: op.author, role: op.role })
        sample.version += 1
        recordVersion(state, sample, op.author, op.role, op.summary)
        branch.status = '已重试'
        branch.resolvedAt = now()
        op.status = '已合并'
        op.syncedAt = now()
        pushHistory(state, {
          sampleId: sample.id,
          by: op.author,
          role: op.role,
          action: '重试',
          version: sample.version,
          detail: `重试待处理分支成功，「${op.summary}」已合入 v${sample.version}。`,
          choices: result.autoMerged.map((p) => `「${labelFor(p)}」采用 ${op.author} / ${op.role}`),
        })
      } else {
        pushHistory(state, {
          sampleId: sample.id,
          by: state.currentUser.name,
          role: state.currentUser.role,
          action: '重试',
          detail: `重试待处理分支「${op.summary}」，仍有 ${result.conflicts.length} 处冲突、${result.preserved.length} 处锁定未解决。`,
          choices: [],
        })
      }
    },
    abandonBranch(state, action: PayloadAction<string>) {
      const branch = state.branches.find((b) => b.id === action.payload)
      if (!branch || branch.status !== '待处理') return
      branch.status = '已放弃'
      branch.resolvedAt = now()
      const op = state.outbox.find((o) => o.id === branch.opId)
      if (op) op.status = '已拒绝'
      pushHistory(state, {
        sampleId: branch.sampleId,
        by: state.currentUser.name,
        role: state.currentUser.role,
        action: '放弃',
        detail: `已放弃待处理分支（操作 ${branch.opId}），其改动不再合入。`,
        choices: [],
      })
    },
    assignBranch(state, action: PayloadAction<{ branchId: string; assignee: string }>) {
      const branch = state.branches.find((b) => b.id === action.payload.branchId)
      if (!branch) return
      branch.assignee = action.payload.assignee
      pushHistory(state, {
        sampleId: branch.sampleId,
        by: state.currentUser.name,
        role: state.currentUser.role,
        action: '指派',
        detail: `待处理分支已指派给 ${action.payload.assignee} 处理。`,
        choices: [],
      })
    },
    /** 审核锁定：只读并生成不可覆盖的快照 */
    lockReview(state) {
      const sample = state.samples.find((s) => s.id === state.selectedId)
      if (!sample || sample.status === '已锁定') return
      sample.status = '已锁定'
      sample.proposals.forEach((p) => {
        if (p.status === '待决定') p.status = '未采纳'
      })
      sample.version += 1
      recordVersion(state, sample, state.currentUser.name, state.currentUser.role, '审核锁定')
      pushHistory(state, {
        sampleId: sample.id,
        by: state.currentUser.name,
        role: state.currentUser.role,
        action: '锁定',
        version: sample.version,
        detail: `本轮已审核锁定，尺寸、批注与方案变为只读，生成不可覆盖的审核快照 v${sample.version}。`,
        choices: [],
      })
    },
    unlockReview(state) {
      const sample = state.samples.find((s) => s.id === state.selectedId)
      if (!sample || sample.status !== '已锁定') return
      sample.status = '待审核'
      sample.version += 1
      recordVersion(state, sample, state.currentUser.name, state.currentUser.role, '解除锁定')
      pushHistory(state, {
        sampleId: sample.id,
        by: state.currentUser.name,
        role: state.currentUser.role,
        action: '解锁',
        version: sample.version,
        detail: `已解除审核锁定，可继续提交变更。`,
        choices: [],
      })
    },
    /** 还原到某个历史版本：逐字段记录取舍 */
    restoreVersion(state, action: PayloadAction<{ sampleId: string; version: number }>) {
      const sample = state.samples.find((s) => s.id === action.payload.sampleId)
      const target = state.versions[action.payload.sampleId]?.find((v) => v.version === action.payload.version)
      if (!sample || !target) return
      const changeset = diffScalarAndMeasurements(sample, target.snapshot)
      state.fieldSources[sample.id] ??= {}
      for (const [path, val] of Object.entries(changeset)) {
        setPath(sample, path, val)
        state.fieldSources[sample.id][path] = { by: state.currentUser.name, role: state.currentUser.role, at: now() }
      }
      sample.version += 1
      recordVersion(state, sample, state.currentUser.name, state.currentUser.role, `还原至 v${action.payload.version}`)
      pushHistory(state, {
        sampleId: sample.id,
        by: state.currentUser.name,
        role: state.currentUser.role,
        action: '还原',
        version: sample.version,
        detail: `已还原至 v${action.payload.version} 的规格与尺寸，生成 v${sample.version}。`,
        choices: Object.keys(changeset).map((p) => `「${labelFor(p)}」还原为 v${action.payload.version} 的值`),
      })
    },
    openSyncCenter(state, action: PayloadAction<string | undefined>) {
      state.syncCenterOpen = true
      state.syncCenterSample = action.payload ?? null
    },
    closeSyncCenter(state) {
      state.syncCenterOpen = false
    },
  },
})

export const {
  selectSample,
  setRounds,
  setCurrentUser,
  setOffline,
  commitEdit,
  syncOutbox,
  decideProposal,
  saveDraft,
  toggleAnnotation,
  resolveAnnotation,
  resolveBranch,
  retryBranch,
  abandonBranch,
  assignBranch,
  lockReview,
  unlockReview,
  restoreVersion,
  openSyncCenter,
  closeSyncCenter,
} = slice.actions

export const developmentReducer = slice.reducer

/** 视图样衣：叠加当前身份尚未同步的离线改动（不同身份互不可见，模拟两台设备） */
export function selectViewSample(state: DevelopmentState, sampleId: string): Sample {
  const canonical = state.samples.find((s) => s.id === sampleId) ?? state.samples[0]
  const mine = state.outbox.filter(
    (op) => op.sampleId === canonical.id && op.status === '待同步' && op.author === state.currentUser.name,
  )
  if (mine.length === 0) return canonical
  const view = structuredClone(canonical)
  for (const op of mine) applyChangeset(view, op.changeset)
  return view
}
