import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LockOutlineIcon from '@mui/icons-material/LockOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined'
import MergeOutlinedIcon from '@mui/icons-material/MergeOutlined'
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { diffSnapshots, lockReview, restoreVersion, unlockReview } from '../features/developmentSlice'
import { snapshotOf } from '../features/mergeEngine'
import type { HistoryEntry, HistoryFieldRecord, HistoryKind } from '../api/types'
import MergeCenter from '../components/MergeCenter'

const kindStyle: Record<HistoryKind, { color: 'success' | 'warning' | 'info' | 'secondary' | 'error' | 'default' | 'primary'; label: string }> = {
  合入: { color: 'success', label: '合入' },
  同步失败: { color: 'error', label: '同步失败' },
  冲突取舍: { color: 'warning', label: '冲突取舍' },
  锁定: { color: 'secondary', label: '审核锁定' },
  解锁: { color: 'info', label: '解锁新开' },
  放弃分支: { color: 'default', label: '放弃分支' },
  历史还原: { color: 'primary', label: '历史还原' },
  他人提交: { color: 'info', label: '他人提交' },
}

export default function HistoryPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const locked = sample.status === '已锁定'
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lockNote, setLockNote] = useState(`确认 ${state.roundB} 版型与工艺资料完整，可进入下一阶段。`)
  const [restoreTarget, setRestoreTarget] = useState<HistoryEntry | null>(null)
  const [chosen, setChosen] = useState<Record<string, boolean>>({})

  const pendingAnnotations = sample.annotations.filter((item) => item.status === '待处理').length
  const pendingProposals = sample.proposals.filter((item) => item.status === '待决定').length
  const canLock = pendingAnnotations === 0 && pendingProposals === 0

  const events = useMemo(
    () => state.history.filter((entry) => entry.sampleId === sample.id).reverse(),
    [state.history, sample.id],
  )
  const pendingBranches = state.branches.filter((branch) => branch.sampleId === sample.id && branch.status === '待处理').length

  /** 还原差异：以“当前版本 → 目标版本快照”逐字段比较，每项单独取舍 */
  const restoreDiffs = useMemo(() => {
    if (!restoreTarget) return [] as HistoryFieldRecord[]
    return diffSnapshots(snapshotOf(sample), restoreTarget.snapshot)
  }, [restoreTarget, sample])

  const openRestore = (entry: HistoryEntry) => {
    setRestoreTarget(entry)
    const diffs = diffSnapshots(snapshotOf(sample), entry.snapshot)
    setChosen(Object.fromEntries(diffs.map((diff) => [diff.field, true])))
  }

  const chosenDiffs = restoreDiffs.filter((diff) => chosen[diff.field])

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">AUDIT TRAIL / 修订历史</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 版本、审核与还原</Typography>
          <Typography color="text.secondary">每次操作记录提交人、基准版本与字段取舍；历史还原逐字段选择，且永远生成新版本，不覆盖任何旧版本。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined">导出修订记录</Button>
          {locked ? (
            <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} onClick={() => dispatch(unlockReview())}>解锁并新开修订</Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<LockOutlineIcon />}
              onClick={() => setConfirmOpen(true)}
              disabled={!canLock || !state.online}
            >
              审核锁定
            </Button>
          )}
        </Stack>
      </Box>

      {!state.online && (
        <Alert severity="warning" icon={<CloudOffOutlinedIcon />} sx={{ mb: 1.5 }}>
          当前离线：审核锁定与历史还原需要在线写入，离线改动暂存与待处理分支会保留到网络恢复。
        </Alert>
      )}
      {!canLock && !locked && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          审核前需处理 {pendingAnnotations} 项待处理批注和 {pendingProposals} 项待决定改版方案。
        </Alert>
      )}
      {locked && <Alert severity="success" sx={{ mb: 1.5 }}>当前版本已锁定，审核资料与已定方案只读保留；解锁后基于锁定快照新开修订版本，锁定版本仍可查看与还原。</Alert>}
      {pendingBranches > 0 && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>该款式有 {pendingBranches} 个待处理分支，请在下方合并中心指派责任人、处理冲突后重试或放弃。</Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 310px' }, gap: 1.5 }}>
        <Box className="panel" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <HistoryOutlinedIcon color="primary" />
            <Typography fontWeight={800}>完整版本时间线</Typography>
            <Chip size="small" variant="outlined" label={`当前 v${sample.version}`} />
          </Stack>
          <Box>
            {events.map((event, index) => {
              const style = kindStyle[event.kind]
              const isVersion = event.snapshot && Object.keys(event.snapshot).length > 0
              const isCurrentVersion = event.version === sample.version
              return (
                <Box key={event.id} sx={{ display: 'grid', gridTemplateColumns: '104px 24px 1fr', gap: 1 }}>
                  <Typography color="text.secondary" fontSize={10.5} pt={0.6}>
                    {event.at}
                    <br />v{event.version}
                  </Typography>
                  <Box sx={{ position: 'relative', '&:before': { content: '""', position: 'absolute', left: 8, top: 8, bottom: -8, width: 1, bgcolor: '#d5ddd9' }, '&:after': { content: '""', position: 'absolute', left: 4, top: 7, width: 7, height: 7, bgcolor: isCurrentVersion ? '#c0692f' : '#25756d', border: '2px solid #fff', borderRadius: '50%', boxShadow: `0 0 0 1px ${isCurrentVersion ? '#c0692f' : '#25756d'}` } }} />
                  <Box sx={{ pb: 2.2 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography fontWeight={800} fontSize={13}>{event.title}</Typography>
                      <Chip size="small" color={style.color} label={style.label} />
                      <Chip size="small" variant="outlined" label={event.module} />
                      {isCurrentVersion && <Chip size="small" color="warning" label="当前版本" />}
                    </Stack>
                    <Typography color="text.secondary" fontSize={12} mt={0.5}>{event.detail}</Typography>
                    <Typography color="#8a918d" fontSize={10.5} mt={0.5}>提交人：{event.author}</Typography>
                    {event.fields.length > 0 && (
                      <Box sx={{ mt: 0.8, display: 'grid', gap: 0.5 }}>
                        {event.fields.slice(0, 6).map((field) => (
                          <Box key={`${field.field}-${field.label}`} sx={{ fontSize: 11, p: 0.7, bgcolor: '#f7f6f3', borderRadius: 0.8 }}>
                            <Typography component="span" fontWeight={750}>{field.label}：</Typography>
                            <Typography component="span" color="text.secondary" sx={{ textDecoration: 'line-through', opacity: 0.75 }}>{field.oldValue || '（空）'}</Typography>
                            {' → '}
                            <Typography component="span" fontWeight={700}>{field.newValue || '（空）'}</Typography>
                          </Box>
                        ))}
                        {event.fields.length > 6 && <Typography fontSize={10.5} color="text.secondary">……共 {event.fields.length} 个字段</Typography>}
                      </Box>
                    )}
                    {isVersion && !locked && (
                      <Button size="small" startIcon={<RestoreOutlinedIcon />} sx={{ mt: 0.6 }} onClick={() => openRestore(event)}>
                        从 v{event.version} 逐字段还原
                      </Button>
                    )}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>

        <Box className="panel" sx={{ alignSelf: 'start' }}>
          <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4', display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <MergeOutlinedIcon fontSize="small" color="primary" />
            <Typography fontWeight={800}>合并与版本规则</Typography>
          </Box>
          <Stack spacing={1.2} p={1.6} fontSize={11.5}>
            {[
              '每次操作都携带提交人与基准版本，离线改动先暂存。',
              '同步时按字段三方合并：未冲突自动合入，同字段冲突留两份并写明双方来源。',
              '基准版本过期时拒绝旧稿整稿写入，只合并不冲突部分。',
              '审核锁定的资料、已定方案照常保留，不被任何旧稿覆盖。',
              '同步失败生成待处理分支：可指派责任人、重试或放弃，重开页面仍在。',
              '历史还原逐字段取舍，每次还原生成新版本，历史永不被覆盖。',
            ].map((text) => (
              <Box key={text} sx={{ display: 'flex', gap: 0.8, p: 1, bgcolor: '#f6f8f7', borderRadius: 1 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#2d7b72', mt: 0.7, flexShrink: 0 }} />
                <Typography fontSize={11.5} color="#43504c">{text}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>

      <MergeCenter scopeSampleId={sample.id} />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认锁定 {state.roundB}（当前 v{sample.version}）</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={1.5}>锁定后本轮尺寸、批注、档案和已定方案变为只读，生成不可覆盖的版本快照；待决定方案将记为未采纳。</Typography>
          <TextField fullWidth multiline minRows={2} label="锁定说明" value={lockNote} onChange={(event) => setLockNote(event.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => { dispatch(lockReview({ note: lockNote })); setConfirmOpen(false) }}>确认锁定</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(restoreTarget)} onClose={() => setRestoreTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>从 v{restoreTarget?.version} 逐字段还原</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" fontSize={12.5} mb={1.5}>
            勾选要还原到 v{restoreTarget?.version} 的字段（当前 v{sample.version}）。未勾选字段保持现值；确认后生成新版本 v{sample.version + 1}，历史版本原样保留。批注等追加资料不参与回退。
          </Typography>
          {restoreDiffs.length === 0 ? (
            <Alert severity="info">当前版本与 v{restoreTarget?.version} 的可还原字段没有差异。</Alert>
          ) : (
            <Stack spacing={1}>
              {restoreDiffs.map((diff) => (
                <Box key={diff.field} sx={{ border: '1px solid #e3e0da', borderRadius: 1.2, p: 1.1 }}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={Boolean(chosen[diff.field])} onChange={(event) => setChosen((current) => ({ ...current, [diff.field]: event.target.checked }))} />}
                    label={<Typography fontWeight={800} fontSize={12.5}>{diff.label}</Typography>}
                  />
                  <Typography fontSize={11.5} color="text.secondary" sx={{ textDecoration: 'line-through', opacity: 0.75 }}>当前：{diff.oldValue || '（空）'}</Typography>
                  <Typography fontSize={12} fontWeight={700}>还原为：{diff.newValue || '（空）'}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreTarget(null)}>取消</Button>
          <Button
            variant="contained"
            startIcon={<RestoreOutlinedIcon />}
            disabled={chosenDiffs.length === 0}
            onClick={() => {
              if (restoreTarget) {
                dispatch(restoreVersion({ sampleId: sample.id, fromVersion: restoreTarget.version, chosen: chosenDiffs }))
                setRestoreTarget(null)
              }
            }}
          >
            还原选中的 {chosenDiffs.length} 项（生成 v{sample.version + 1}）
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
