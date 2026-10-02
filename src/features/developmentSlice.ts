import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { seedSamples } from '../api/seed'
import type {
  ConflictRecord,
  FieldChange,
  HistoryEntry,
  HistoryFieldRecord,
  MergeModule,
  PendingBranch,
  Sample,
} from '../api/types'
import { applyResolution, diffSnapshots, getAdapter, runMerge, snapshotOf } from './mergeEngine'

export const teamMembers = ['陈曼 / 产品', '周研 / 版师', '沈岚 / 产品开发', '顾恺 / 质检'] as const
export const branchAssignees = ['陈曼 / 产品', '周研 / 版师', '沈岚 / 产品开发', '顾恺 / 质检', '暂不指派']

type Toast = { id: number; severity: 'success' | 'warning' | 'info' | 'error'; text: string }

type DevelopmentState = {
  samples: Sample[]
  selectedId: string
  roundA: '第一轮' | '第二轮' | '第三轮'
  roundB: '第一轮' | '第二轮' | '第三轮'
  currentUser: string
  online: boolean
  pendingChanges: FieldChange[]
  branches: PendingBranch[]
  history: HistoryEntry[]
  activeAnnotation: string | null
  toast?: Toast
}

const storageKey = 'garment-sampling-merge-v2'

const nowText = () =>
  new Date().toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-')

let seq = 0
const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`

const sampleLabel = (sample: Sample) => `${sample.styleCode} · ${sample.styleName}`

/** 预置版本快照与审计历史，演示历史还原的逐字段取舍 */
function buildSeedHistory(samples: Sample[]): HistoryEntry[] {
  const s18 = samples.find((item) => item.id === 'SMP-26018')
  const s21 = samples.find((item) => item.id === 'SMP-26021')
  if (!s18 || !s21) return []

  const v3 = snapshotOf(s18)
  const v2: Record<string, string> = {
    ...v3,
    fabric: '三防棉锦 / 军绿',
    craft: '立体贴袋\n双针压线 0.6cm',
    draftNotes: '第二轮肩袖活动量改善，袖窿仍需第三轮复核。',
  }
  const v1: Record<string, string> = {
    ...v2,
    fabric: '全棉斜纹 / 军绿',
    craft: '立体贴袋',
    draftNotes: '第一轮抬手带动前片，肩袖活动量不足。',
  }
  const v21 = snapshotOf(s21)

  return [
    {
      id: 'H-SEED-18-V1', sampleId: 'SMP-26018', version: 1, at: '2026-09-20 10:30', author: '沈岚 / 产品开发', module: '款式档案',
      kind: '合入', title: '建立款式档案并导入第一轮实测',
      detail: '建档：录入供应商、面辅料、工艺要求与第一轮 6 项尺寸实测。',
      fields: [], snapshot: v1,
    },
    {
      id: 'H-SEED-18-V2', sampleId: 'SMP-26018', version: 2, at: '2026-09-24 16:10', author: '周研 / 版师', module: '款式档案',
      kind: '合入', title: '第二轮样衣资料合入',
      detail: '面辅料改为三防棉锦，新增双针压线工艺，更新第二轮评审意见。',
      fields: [
        { field: 'fabric', label: '面辅料', oldValue: v1.fabric, newValue: v2.fabric },
        { field: 'craft', label: '工艺要求', oldValue: v1.craft, newValue: v2.craft },
        { field: 'draftNotes', label: '轮次评审草稿', oldValue: v1.draftNotes ?? '', newValue: v2.draftNotes ?? '' },
      ],
      snapshot: v2,
    },
    {
      id: 'H-SEED-18-V3', sampleId: 'SMP-26018', version: 3, at: '2026-09-27 17:40', author: '陈曼 / 产品', module: '样衣评审',
      kind: '合入', title: '第三轮批注与工艺定稿合入',
      detail: '新增袖口暗扣工艺，录入第三轮试穿意见与领口批注。',
      fields: [
        { field: 'craft', label: '工艺要求', oldValue: v2.craft, newValue: v3.craft },
        { field: 'draftNotes', label: '轮次评审草稿', oldValue: v2.draftNotes ?? '', newValue: v3.draftNotes ?? '' },
      ],
      snapshot: v3,
    },
    {
      id: 'H-SEED-21-V1', sampleId: 'SMP-26021', version: 1, at: '2026-09-25 11:20', author: '陈曼 / 产品', module: '款式档案',
      kind: '合入', title: '建立岩灰轻量风衣档案',
      detail: '建档：隐形门襟、后背防风片、可拆腰带三项工艺，导入第一轮实测。',
      fields: [], snapshot: v21,
    },
  ]
}

function freshState(): DevelopmentState {
  const samples = structuredClone(seedSamples)
  return {
    samples,
    selectedId: samples[0].id,
    roundA: '第二轮',
    roundB: '第三轮',
    currentUser: '陈曼 / 产品',
    online: true,
    pendingChanges: [],
    branches: [],
    history: buildSeedHistory(samples),
    activeAnnotation: null,
  }
}

const saved = localStorage.getItem(storageKey)
const parsed = saved ? (JSON.parse(saved) as Partial<DevelopmentState>) : null
// 旧版本缓存字段不全时直接重建，保证合并流程所需字段完整
const initialState: DevelopmentState =
  parsed && parsed.samples && parsed.history && parsed.branches && parsed.pendingChanges
    ? (parsed as DevelopmentState)
    : freshState()

/** 查每个字段在服务端的最后修改人，用于冲突卡片写明双方来源 */
function serverAuthorsFor(history: HistoryEntry[], sampleId: string, changes: FieldChange[]) {
  const authors: Record<string, string> = {}
  for (const change of changes) {
    const record = [...history]
      .reverse()
      .find((entry) => entry.sampleId === sampleId && entry.fields.some((field) => field.field === change.field))
    if (record) authors[change.field] = record.author
  }
  return authors
}

function historyFieldsFrom(changes: FieldChange[], sample: Sample): HistoryFieldRecord[] {
  return changes
    .filter((change) => !change.appendItem)
    .map((change) => ({
      field: change.field,
      label: getAdapter(change.field)?.label ?? change.label,
      oldValue: change.oldValue,
      newValue: change.newValue,
      author: change.author,
    }))
}

const peerEdits: Record<string, Array<{ field: string; value: string }>> = {
  'SMP-26018': [
    { field: 'fabric', value: '三防棉锦 / 军绿色（备纱卡其）' },
    { field: 'colorway', value: '苔绿 18-0322 TCX（周研 10-02 复核）' },
  ],
  'SMP-26021': [
    { field: 'supplier', value: '宁波原野服饰（二厂协作）' },
    { field: 'owner', value: '周研' },
  ],
}

const slice = createSlice({
  name: 'development',
  initialState,
  reducers: {
    selectSample(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
      state.activeAnnotation = null
    },
    toggleAnnotation(state, action: PayloadAction<string | null>) {
      state.activeAnnotation = action.payload
    },
    setRounds(state, action: PayloadAction<{ a?: DevelopmentState['roundA']; b?: DevelopmentState['roundB'] }>) {
      if (action.payload.a) state.roundA = action.payload.a
      if (action.payload.b) state.roundB = action.payload.b
    },
    setCurrentUser(state, action: PayloadAction<string>) {
      state.currentUser = action.payload
    },
    setOnline(state, action: PayloadAction<boolean>) {
      state.online = action.payload
      state.toast = {
        id: Date.now(),
        severity: action.payload ? 'success' : 'warning',
        text: action.payload ? '网络已恢复，可以同步离线改动。' : '已切换离线模式，改动将先暂存，恢复后再合并。',
      }
    },

    /** 暂存一次操作：自带提交人、基准版本与基准值 */
    stageChange(
      state,
      action: PayloadAction<{ sampleId: string; field: string; newValue: string; appendItem?: FieldChange['appendItem']; note?: string }>,
    ) {
      const { sampleId, field, newValue, appendItem, note } = action.payload
      const sample = state.samples.find((item) => item.id === sampleId)
      const adapter = getAdapter(field)
      if (!sample || !adapter) return
      const reason = adapter.protectedReason?.(sample)
      if (reason) {
        state.toast = { id: Date.now(), severity: 'warning', text: reason }
        return
      }
      const existing = state.pendingChanges.find((change) => change.sampleId === sampleId && change.field === field)
      const oldValue = existing?.oldValue ?? adapter.read(sample)
      const baseVersion = existing?.baseVersion ?? sample.version
      // 同字段连续编辑只保留一笔，基准版本始终是开始离线时的版本
      if (existing) {
        existing.newValue = newValue
        existing.note = note ?? existing.note
        if (appendItem) existing.appendItem = appendItem
      } else {
        state.pendingChanges.push({
          id: genId('CH'),
          sampleId,
          field,
          label: adapter.label,
          module: adapter.module,
          oldValue,
          newValue,
          appendItem,
          note,
          baseVersion,
          author: state.currentUser,
          at: nowText(),
        })
      }
      state.toast = {
        id: Date.now(),
        severity: state.online ? 'info' : 'warning',
        text: state.online ? '改动已暂存，点击“同步合并”写入。' : '离线改动已暂存，将在网络恢复后合并。',
      }
    },
    undoStaged(state, action: PayloadAction<string>) {
      state.pendingChanges = state.pendingChanges.filter((change) => change.id !== action.payload)
    },

    /** 演示用：模拟另一位协作者（版师周研）后保存，推高服务端版本 */
    simulatePeerSubmit(state, action: PayloadAction<{ sampleId: string }>) {
      const sample = state.samples.find((item) => item.id === action.payload.sampleId)
      if (!sample || sample.status === '已锁定') return
      const peer = '周研 / 版师'
      const fields: HistoryFieldRecord[] = []
      for (const edit of peerEdits[sample.id] ?? [{ field: 'fabric', value: `${sample.fabric}（${peer} 修订）` }]) {
        const adapter = getAdapter(edit.field)
        if (!adapter?.write) continue
        const oldValue = adapter.read(sample)
        adapter.write(sample, edit.value)
        fields.push({ field: edit.field, label: adapter.label, oldValue, newValue: edit.value, author: peer })
      }
      const annotation = {
        id: genId('AN-P'),
        x: 38,
        y: 46,
        part: '版型',
        content: `${peer} 离线回来补录：复核 ${sample.styleCode} 肩线与袖山吃势。`,
        author: peer,
        status: '待处理' as const,
      }
      sample.annotations.push(annotation)
      sample.version += 1
      state.history.push({
        id: genId('H'),
        sampleId: sample.id,
        version: sample.version,
        at: nowText(),
        author: peer,
        module: '样衣评审',
        kind: '他人提交',
        title: `协作者提交新版本 v${sample.version}`,
        detail: `${peer} 保存了 ${fields.length} 个字段修改并补录 1 条批注，服务端版本已更新。`,
        fields,
        snapshot: snapshotOf(sample),
      })
      state.toast = {
        id: Date.now(),
        severity: 'info',
        text: `${peer} 已保存 ${sample.styleCode}，服务端推进到 v${sample.version}，你的离线稿基准已过期。`,
      }
    },

    /** 同步合并：可同步单个款式，也可一次同步全部暂存改动 */
    syncChanges(state, action: PayloadAction<{ sampleId?: string }>) {
      const ids = action.payload.sampleId
        ? [action.payload.sampleId]
        : [...new Set(state.pendingChanges.map((change) => change.sampleId))]

      for (const sampleId of ids) {
        const sample = state.samples.find((item) => item.id === sampleId)
        const changes = state.pendingChanges.filter((change) => change.sampleId === sampleId)
        if (!sample || changes.length === 0) continue
        const modules = [...new Set(changes.map((change) => change.module))] as MergeModule[]
        const stale = changes.some((change) => change.baseVersion < sample.version)

        // 离线 / 弱网失败：整稿不写入，留下待处理分支（重开页面仍在）
        if (!state.online) {
          const branch: PendingBranch = {
            id: genId('BR'),
            sampleId,
            sampleLabel: sampleLabel(sample),
            modules,
            author: state.currentUser,
            baseVersion: Math.min(...changes.map((change) => change.baseVersion)),
            createdAt: changes[0].at,
            failedAt: nowText(),
            failReason: '离线期间无法写入服务器，同步失败，改动保留为待处理分支。',
            stale,
            serverVersionAtReview: sample.version,
            changes,
            conflicts: [],
            autoMerged: [],
            blocked: [],
            status: '待处理',
            assignee: state.currentUser,
          }
          state.branches.unshift(branch)
          state.history.push({
            id: genId('H'),
            sampleId,
            version: sample.version,
            at: nowText(),
            author: state.currentUser,
            module: modules[0],
            kind: '同步失败',
            title: `同步失败，生成待处理分支 ${branch.id.slice(-4)}`,
            detail: `基准 v${branch.baseVersion}，共 ${changes.length} 项改动等待网络恢复后重试或放弃。`,
            fields: historyFieldsFrom(changes, sample),
            snapshot: snapshotOf(sample),
          })
          state.pendingChanges = state.pendingChanges.filter((change) => change.sampleId !== sampleId)
          state.toast = { id: Date.now(), severity: 'warning', text: `${sample.styleCode} 离线同步失败，已生成待处理分支，可稍后重试或放弃。` }
          continue
        }

        // 在线：走三方合并
        const result = runMergeSafe(sample, changes, state.history)
        const mergedSample = result.sample
        state.samples = state.samples.map((item) => (item.id === sampleId ? mergedSample : item))

        const mergedFields = historyFieldsFrom(
          changes.filter((change) => result.autoMerged.some((item) => item.field === change.field)),
          mergedSample,
        )
        state.history.push({
          id: genId('H'),
          sampleId,
          version: mergedSample.version,
          at: nowText(),
          author: state.currentUser,
          module: modules[0],
          kind: '合入',
          title: `离线改动合入 v${mergedSample.version}`,
          detail: stale
            ? `基准 v${Math.min(...changes.map((c) => c.baseVersion))} 已过期，整稿覆盖被拒绝；${result.autoMerged.length} 项未冲突改动自动合入，${result.conflicts.length} 项同字段冲突保留两份待取舍。`
            : `${result.autoMerged.length} 项改动自动合入；批注按并集保留，审核锁定与已定方案未改动。`,
          fields: mergedFields,
          snapshot: snapshotOf(mergedSample),
        })

        if (result.conflicts.length > 0) {
          const branch: PendingBranch = {
            id: genId('BR'),
            sampleId,
            sampleLabel: sampleLabel(sample),
            modules,
            author: state.currentUser,
            baseVersion: Math.min(...changes.map((change) => change.baseVersion)),
            createdAt: changes[0].at,
            failedAt: nowText(),
            failReason: stale
              ? `基准版本 v${Math.min(...changes.map((c) => c.baseVersion))} 已过期，服务端当前为 v${sample.version}，旧稿整稿写入被拒绝。`
              : `同字段被双方修改，自动合入 ${result.autoMerged.length} 项后仍有 ${result.conflicts.length} 项冲突。`,
            stale,
            serverVersionAtReview: mergedSample.version,
            changes,
            conflicts: result.conflicts,
            autoMerged: result.autoMerged,
            blocked: result.blocked,
            status: '待处理',
            assignee: state.currentUser,
          }
          state.branches.unshift(branch)
          state.toast = { id: Date.now(), severity: 'warning', text: `${sample.styleCode}：${result.autoMerged.length} 项已自动合入，${result.conflicts.length} 项冲突已留两份并生成待处理分支。` }
        } else {
          state.toast = {
            id: Date.now(),
            severity: 'success',
            text: `${sample.styleCode} 已合入到 v${mergedSample.version}（基准 v${Math.min(...changes.map((c) => c.baseVersion))}）。`,
          }
        }
        state.pendingChanges = state.pendingChanges.filter((change) => change.sampleId !== sampleId)
      }
    },

    /** 冲突逐项取舍：留服务端 / 用离线稿 / 填自定义值，每次取舍都入历史 */
    resolveConflict(
      state,
      action: PayloadAction<{ branchId: string; field: string; resolution: ConflictRecord['resolution']; customValue?: string }>,
    ) {
      const branch = state.branches.find((item) => item.id === action.payload.branchId)
      const conflict = branch?.conflicts.find((item) => item.field === action.payload.field)
      if (!branch || !conflict) return
      if (action.payload.resolution === 'custom' && !action.payload.customValue?.trim()) return
      conflict.resolution = action.payload.resolution
      conflict.customValue = action.payload.customValue

      const sample = state.samples.find((item) => item.id === branch.sampleId)
      if (!sample) return
      const chosenText =
        conflict.resolution === 'keepServer'
          ? conflict.serverValue
          : conflict.resolution === 'useIncoming'
            ? conflict.incomingValue
            : conflict.customValue ?? ''

      // 离线时只把取舍决定记在分支上，恢复网络后由“重试合入”统一写版本
      if (!state.online) {
        state.toast = { id: Date.now(), severity: 'info', text: '取舍已记录在分支上；网络恢复后点击重试即可合入。' }
        return
      }

      const next = applyResolution(sample, conflict)
      // 真正改了服务端值才升版本；选择“保留服务端”只记录取舍，不改版本
      const snapshotKey = getAdapter(conflict.field)?.snapshotKey ?? conflict.field
      if (next !== sample && snapshotOf(next)[snapshotKey] !== snapshotOf(sample)[snapshotKey]) {
        next.version += 1
      }
      if (next !== sample) state.samples = state.samples.map((item) => (item.id === branch.sampleId ? next : item))
      state.history.push({
        id: genId('H'),
        sampleId: branch.sampleId,
        version: next.version,
        at: nowText(),
        author: state.currentUser,
        module: conflict.module,
        kind: '冲突取舍',
        title: `冲突取舍 · ${conflict.label}`,
        detail:
          conflict.resolution === 'keepServer'
            ? `保留服务端版本（${conflict.serverAuthor}）。`
            : conflict.resolution === 'useIncoming'
              ? `采用离线稿（${conflict.incomingAuthor}）。`
              : `填入自定义合并值。`,
        fields: [{ field: conflict.field, label: conflict.label, oldValue: conflict.serverValue, newValue: chosenText, author: state.currentUser }],
        snapshot: snapshotOf(next),
      })
    },

    assignBranch(state, action: PayloadAction<{ branchId: string; assignee: string }>) {
      const branch = state.branches.find((item) => item.id === action.payload.branchId)
      if (branch) {
        branch.assignee = action.payload.assignee
        state.toast = { id: Date.now(), severity: 'info', text: `分支已指派给 ${action.payload.assignee}。` }
      }
    },

    /** 责任人重试：已取舍的字段按决定直接写回；锁定后已解除的资料也一并补合；未取舍冲突继续留在分支 */
    retryBranch(state, action: PayloadAction<{ branchId: string }>) {
      const branch = state.branches.find((item) => item.id === action.payload.branchId)
      if (!branch || branch.status !== '待处理') return
      if (!state.online) {
        state.toast = { id: Date.now(), severity: 'warning', text: '网络仍未恢复，分支保持待处理，恢复后可再次重试。' }
        return
      }
      const sample = state.samples.find((item) => item.id === branch.sampleId)
      if (!sample) return

      const next = structuredClone(sample)
      let applied = 0
      const stillBlocked: typeof branch.blocked = []

      // 1) 冲突按责任人的取舍写回
      for (const conflict of branch.conflicts) {
        if (!conflict.resolution) continue
        const adapter = getAdapter(conflict.field)
        const reason = adapter?.protectedReason?.(next)
        if (reason) {
          stillBlocked.push({ field: conflict.field, label: conflict.label, module: conflict.module, value: conflict.incomingValue, reason })
          continue
        }
        if (adapter?.write) {
          const chosen =
            conflict.resolution === 'keepServer'
              ? conflict.serverValue
              : conflict.resolution === 'custom'
                ? conflict.customValue ?? ''
                : conflict.incomingValue
          if (chosen !== adapter.read(next)) {
            adapter.write(next, chosen)
            applied += 1
          }
        }
      }

      // 2) 首次合并时因锁定/已定方案被拦的字段：若现在已解锁或方案已重开，则补合入
      const blockedFields = new Set(branch.blocked.map((item) => item.field))
      for (const change of branch.changes.filter((item) => blockedFields.has(item.field))) {
        const adapter = getAdapter(change.field)
        if (!adapter) continue
        const reason = adapter.protectedReason?.(next)
        if (reason) {
          stillBlocked.push({ field: change.field, label: adapter.label, module: change.module, value: change.newValue, reason })
          continue
        }
        if (adapter.appendAnnotation && change.appendItem && !next.annotations.some((a) => a.id === change.appendItem!.id)) {
          next.annotations.push(structuredClone(change.appendItem))
          applied += 1
          continue
        }
        if (adapter.write && adapter.read(next) !== change.newValue) {
          adapter.write(next, change.newValue)
          applied += 1
        }
      }

      if (applied > 0) next.version += 1
      state.samples = state.samples.map((item) => (item.id === branch.sampleId ? next : item))

      const remainingConflicts = branch.conflicts.filter((item) => !item.resolution)
      branch.conflicts = remainingConflicts
      branch.blocked = stillBlocked
      branch.serverVersionAtReview = next.version
      branch.failedAt = nowText()

      if (remainingConflicts.length === 0) {
        branch.status = '已合入'
        branch.closedAt = nowText()
        branch.closeNote =
          stillBlocked.length > 0
            ? `冲突已全部取舍并合入；${stillBlocked.length} 项锁定/已定资料按规则保留未写入。`
            : applied > 0
              ? '冲突已全部取舍并合入。'
              : '冲突取舍已在线即时写入，分支关闭。'
        state.history.push({
          id: genId('H'),
          sampleId: branch.sampleId,
          version: next.version,
          at: nowText(),
          author: state.currentUser,
          module: branch.modules[0],
          kind: '合入',
          title: `分支 ${branch.id.slice(-4)} 重试合入完成`,
          detail: `${branch.closeNote}（本次重试写入 ${applied} 项，责任人：${branch.assignee}）`,
          fields: [],
          snapshot: snapshotOf(next),
        })
        state.toast = { id: Date.now(), severity: 'success', text: '分支冲突已全部处理，重试合入完成。' }
      } else {
        state.toast = { id: Date.now(), severity: 'warning', text: `仍有 ${remainingConflicts.length} 项冲突未取舍，分支继续保持待处理。` }
      }
    },

    /** 放弃分支：离线稿作废，但历史中保留这次取舍记录 */
    abandonBranch(state, action: PayloadAction<{ branchId: string }>) {
      const branch = state.branches.find((item) => item.id === action.payload.branchId)
      if (!branch || branch.status !== '待处理') return
      branch.status = '已放弃'
      branch.closedAt = nowText()
      branch.closeNote = '责任人放弃该离线稿，未合入任何改动。'
      const sample = state.samples.find((item) => item.id === branch.sampleId)
      state.history.push({
        id: genId('H'),
        sampleId: branch.sampleId,
        version: sample?.version ?? branch.serverVersionAtReview,
        at: nowText(),
        author: state.currentUser,
        module: branch.modules[0],
        kind: '放弃分支',
        title: `放弃待处理分支 ${branch.id.slice(-4)}`,
        detail: `基准 v${branch.baseVersion} 的 ${branch.changes.length} 项离线改动作废，服务端资料保持不变。`,
        fields: [],
        snapshot: sample ? snapshotOf(sample) : {},
      })
      state.toast = { id: Date.now(), severity: 'info', text: '分支已放弃，离线稿未写入，记录保留在修订历史。' }
    },

    lockReview(state, action: PayloadAction<{ note: string }>) {
      const sample = state.samples.find((item) => item.id === state.selectedId)
      if (!sample) return
      if (!state.online) {
        state.toast = { id: Date.now(), severity: 'error', text: '离线时不能执行审核锁定，请恢复网络后再操作。' }
        return
      }
      const pendingProposals = sample.proposals.filter((proposal) => proposal.status === '待决定')
      pendingProposals.forEach((proposal) => {
        proposal.status = '未采纳'
      })
      sample.status = '已锁定'
      sample.version += 1
      state.history.push({
        id: genId('H'),
        sampleId: sample.id,
        version: sample.version,
        at: nowText(),
        author: state.currentUser,
        module: '修订历史',
        kind: '锁定',
        title: `审核锁定 v${sample.version}`,
        detail: `${action.payload.note}${pendingProposals.length ? `；锁定时 ${pendingProposals.length} 个待决定方案记为未采纳。` : ''}锁定资料与已定方案只读保留。`,
        fields: pendingProposals.map((proposal) => ({
          field: `proposal:${proposal.id}:status`,
          label: `${proposal.id} 决定状态`,
          oldValue: '待决定',
          newValue: '未采纳',
        })),
        snapshot: snapshotOf(sample),
      })
      state.toast = { id: Date.now(), severity: 'success', text: `${sample.styleCode} 已审核锁定，资料与已定方案照常保留。` }
    },
    unlockReview(state) {
      const sample = state.samples.find((item) => item.id === state.selectedId)
      if (!sample || sample.status !== '已锁定') return
      sample.status = '待审核'
      sample.version += 1
      state.history.push({
        id: genId('H'),
        sampleId: sample.id,
        version: sample.version,
        at: nowText(),
        author: state.currentUser,
        module: '修订历史',
        kind: '解锁',
        title: `解锁并新开修订 v${sample.version}`,
        detail: '解锁后基于当前锁定快照新开修订分支，历史锁定版本仍可查看与还原。',
        fields: [],
        snapshot: snapshotOf(sample),
      })
      state.toast = { id: Date.now(), severity: 'info', text: '已解锁，新开一个修订版本，锁定快照仍保留在历史。' }
    },

    /** 历史还原：逐字段取舍，每次还原都生成新版本，绝不覆盖历史 */
    restoreVersion(
      state,
      action: PayloadAction<{ sampleId: string; fromVersion: number; chosen: HistoryFieldRecord[] }>,
    ) {
      const sample = state.samples.find((item) => item.id === action.payload.sampleId)
      if (!sample) return
      if (sample.status === '已锁定') {
        state.toast = { id: Date.now(), severity: 'warning', text: '样衣已审核锁定，不能还原；请先解锁新开修订。' }
        return
      }
      if (!state.online) {
        state.toast = { id: Date.now(), severity: 'warning', text: '离线时不能还原历史版本，请恢复网络后再操作。' }
        return
      }
      for (const field of action.payload.chosen) {
        getAdapter(field.field)?.write?.(sample, field.newValue)
      }
      sample.version += 1
      state.history.push({
        id: genId('H'),
        sampleId: sample.id,
        version: sample.version,
        at: nowText(),
        author: state.currentUser,
        module: '修订历史',
        kind: '历史还原',
        title: `从 v${action.payload.fromVersion} 逐字段还原到 v${sample.version}`,
        detail: `本次取舍还原 ${action.payload.chosen.length} 个字段，未勾选字段保持当前值；历史版本原样保留。`,
        fields: action.payload.chosen,
        snapshot: snapshotOf(sample),
      })
      state.toast = { id: Date.now(), severity: 'success', text: `已按取舍还原 ${action.payload.chosen.length} 个字段，生成新版本 v${sample.version}。` }
    },

    clearToast(state) {
      state.toast = undefined
    },
  },
})

/** 包一层三方合并，注入字段的服务端修改人信息 */
function runMergeSafe(sample: Sample, changes: FieldChange[], history: HistoryEntry[]) {
  return runMerge(sample, changes, { serverAuthors: serverAuthorsFor(history, sample.id, changes) })
}

export const {
  selectSample,
  toggleAnnotation,
  setRounds,
  setCurrentUser,
  setOnline,
  stageChange,
  undoStaged,
  simulatePeerSubmit,
  syncChanges,
  resolveConflict,
  assignBranch,
  retryBranch,
  abandonBranch,
  lockReview,
  unlockReview,
  restoreVersion,
  clearToast,
} = slice.actions

export { diffSnapshots }
export const developmentReducer = slice.reducer
