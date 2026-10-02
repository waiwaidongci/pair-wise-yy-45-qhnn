import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined'
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined'
import MergeOutlinedIcon from '@mui/icons-material/MergeOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import LockOutlineIcon from '@mui/icons-material/LockOutlined'
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined'
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  abandonBranch,
  assignBranch,
  branchAssignees,
  clearToast,
  resolveConflict,
  retryBranch,
  setCurrentUser,
  setOnline,
  simulatePeerSubmit,
  syncChanges,
  teamMembers,
  undoStaged,
} from '../features/developmentSlice'
import type { ConflictRecord, PendingBranch } from '../api/types'

function ValueCard({
  badge,
  source,
  value,
  note,
  bgcolor,
}: {
  badge: string
  source: string
  value: string
  note?: string
  bgcolor: string
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, p: 1.1, borderRadius: 1.2, border: '1px solid #e4e0da', bgcolor }}>
      <Stack direction="row" spacing={0.6} alignItems="center" mb={0.5}>
        <Chip size="small" label={badge} sx={{ height: 19, fontSize: 10 }} />
        <Typography fontSize={10.5} color="text.secondary" noWrap>来源：{source}</Typography>
      </Stack>
      <Typography fontSize={12.5} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '（空）'}</Typography>
      {note && <Typography fontSize={10.5} color="text.secondary" mt={0.5}>附言：{note}</Typography>}
    </Box>
  )
}

function ConflictRow({ branch, conflict }: { branch: PendingBranch; conflict: ConflictRecord }) {
  const dispatch = useAppDispatch()
  const [custom, setCustom] = useState(conflict.customValue ?? '')
  const resolved = Boolean(conflict.resolution)

  return (
    <Box sx={{ p: 1.3, border: '1px solid #ecdccb', borderRadius: 1.4, bgcolor: '#fffaf4' }}>
      <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" mb={1}>
        <WarningAmberOutlinedIcon sx={{ fontSize: 17, color: '#c0692f' }} />
        <Typography fontWeight={800} fontSize={12.5}>同字段冲突 · {conflict.label}</Typography>
        <Chip size="small" label={conflict.module} variant="outlined" sx={{ height: 19, fontSize: 10 }} />
        {resolved && <Chip size="small" color="success" label={`已取舍：${conflict.resolution === 'keepServer' ? '留服务端' : conflict.resolution === 'useIncoming' ? '用离线稿' : '自定义'}`} />}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <ValueCard badge="服务端现值" source={conflict.serverAuthor} value={conflict.serverValue} bgcolor="#f1f6f4" />
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, placeItems: 'center', color: '#b77f4f' }}>
          <MergeOutlinedIcon />
        </Box>
        <ValueCard badge="离线改动" source={`${conflict.incomingAuthor} · ${conflict.incomingAt}`} value={conflict.incomingValue} note={conflict.incomingNote} bgcolor="#f7f3ee" />
      </Stack>
      <Box sx={{ mt: 1 }}>
        <TextField
          fullWidth
          size="small"
          multiline
          minRows={1}
          label="自定义合并值（两份都不满意时填写，留空则不采用）"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          sx={{ mb: 0.8 }}
        />
        <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant={conflict.resolution === 'keepServer' ? 'contained' : 'outlined'}
            color="success"
            onClick={() => dispatch(resolveConflict({ branchId: branch.id, field: conflict.field, resolution: 'keepServer' }))}
          >
            保留服务端
          </Button>
          <Button
            size="small"
            variant={conflict.resolution === 'useIncoming' ? 'contained' : 'outlined'}
            color="secondary"
            onClick={() => dispatch(resolveConflict({ branchId: branch.id, field: conflict.field, resolution: 'useIncoming' }))}
          >
            采用离线稿
          </Button>
          <Button
            size="small"
            variant={conflict.resolution === 'custom' ? 'contained' : 'outlined'}
            disabled={!custom.trim()}
            onClick={() => dispatch(resolveConflict({ branchId: branch.id, field: conflict.field, resolution: 'custom', customValue: custom }))}
          >
            使用自定义值
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}

function BranchCard({ branch }: { branch: PendingBranch }) {
  const dispatch = useAppDispatch()
  const online = useAppSelector((state) => state.development.online)
  const unresolved = branch.conflicts.filter((item) => !item.resolution).length

  if (branch.status !== '待处理') {
    return (
      <Box sx={{ p: 1.2, border: '1px dashed #d9d5ce', borderRadius: 1.4, bgcolor: '#faf9f6' }}>
        <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
          <Chip size="small" label={branch.status} color={branch.status === '已合入' ? 'success' : 'default'} />
          <Typography fontSize={12} fontWeight={700}>{branch.sampleLabel}</Typography>
          <Typography fontSize={10.5} color="text.secondary">基准 v{branch.baseVersion} · {branch.closedAt}</Typography>
        </Stack>
        <Typography fontSize={11} color="text.secondary" mt={0.5}>{branch.closeNote}</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 1.4, border: '1px solid #e8d9c6', borderRadius: 1.6, bgcolor: '#fffdf9' }}>
      <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" mb={0.6}>
        <Chip size="small" color="warning" label="待处理分支" />
        <Typography fontWeight={800} fontSize={13}>{branch.sampleLabel}</Typography>
        <Tooltip title={branch.failReason}>
          <Chip
            size="small"
            icon={branch.stale ? <WarningAmberOutlinedIcon /> : undefined}
            color={branch.stale ? 'error' : 'default'}
            label={branch.stale ? `基准过期 v${branch.baseVersion} → 服务端 v${branch.serverVersionAtReview}` : `基准 v${branch.baseVersion}`}
            sx={{ height: 20 }}
          />
        </Tooltip>
      </Stack>
      <Typography fontSize={11.5} color="#9a6a3c" mb={1}>{branch.failReason}</Typography>
      <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap mb={0.5}>
        {branch.modules.map((module) => (
          <Chip key={module} size="small" variant="outlined" label={module} sx={{ height: 19, fontSize: 10 }} />
        ))}
        <Chip size="small" variant="outlined" label={`提交人 ${branch.author}`} sx={{ height: 19, fontSize: 10 }} />
        <Chip size="small" variant="outlined" label={`同步失败 ${branch.failedAt}`} sx={{ height: 19, fontSize: 10 }} />
      </Stack>

      {branch.autoMerged.length > 0 && (
        <Alert severity="success" icon={false} sx={{ py: 0.5, mt: 0.8, '& .MuiAlert-message': { py: 0.3 } }}>
          <Typography fontSize={11.5} fontWeight={750}>{branch.autoMerged.length} 项未冲突内容已自动合入：</Typography>
          <Stack direction="row" spacing={0.5} mt={0.4} flexWrap="wrap" useFlexGap>
            {branch.autoMerged.map((item, index) => (
              <Chip key={`${item.field}-${index}`} size="small" label={`${item.label} · ${item.author}`} sx={{ height: 19, fontSize: 10 }} />
            ))}
          </Stack>
        </Alert>
      )}

      {branch.blocked.length > 0 && (
        <Alert severity="info" icon={<LockOutlineIcon fontSize="small" />} sx={{ py: 0.5, mt: 0.8, '& .MuiAlert-message': { py: 0.3 } }}>
          <Typography fontSize={11.5} fontWeight={750}>{branch.blocked.length} 项受保护资料拒绝写入、照常保留：</Typography>
          {branch.blocked.map((item) => (
            <Typography key={item.field} fontSize={10.5} color="text.secondary">· {item.label}：{item.reason}</Typography>
          ))}
        </Alert>
      )}

      {branch.conflicts.length > 0 && (
        <Stack spacing={1} mt={1}>
          {branch.conflicts.map((conflict) => (
            <ConflictRow key={conflict.field} branch={branch} conflict={conflict} />
          ))}
        </Stack>
      )}

      <Divider sx={{ my: 1.1 }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>指派责任人</InputLabel>
          <Select
            label="指派责任人"
            value={branch.assignee}
            onChange={(event) => dispatch(assignBranch({ branchId: branch.id, assignee: event.target.value }))}
          >
            {branchAssignees.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="放弃后离线稿作废，服务端资料不变，记录保留在修订历史">
          <Button size="small" color="inherit" startIcon={<DeleteOutlineOutlinedIcon />} onClick={() => dispatch(abandonBranch({ branchId: branch.id }))}>
            放弃分支
          </Button>
        </Tooltip>
        <Button
          size="small"
          variant="contained"
          disabled={!online}
          startIcon={<AutorenewOutlinedIcon />}
          onClick={() => dispatch(retryBranch({ branchId: branch.id }))}
        >
          {unresolved > 0 ? `重试合入（剩 ${unresolved} 项待取舍）` : '重试合入'}
        </Button>
      </Stack>
      {!online && <Typography fontSize={10.5} color="text.secondary" mt={0.6}>网络未恢复，分支将继续保留在本机，重开页面也不会丢失。</Typography>}
    </Box>
  )
}

export default function MergeCenter({ scopeSampleId }: { scopeSampleId?: string }) {
  const dispatch = useAppDispatch()
  const { currentUser, online, pendingChanges, branches, samples, toast } = useAppSelector((state) => state.development)
  const [showClosed, setShowClosed] = useState(false)

  const scopedChanges = scopeSampleId ? pendingChanges.filter((change) => change.sampleId === scopeSampleId) : pendingChanges
  const scopedBranches = scopeSampleId ? branches.filter((branch) => branch.sampleId === scopeSampleId) : branches
  const pendingBranches = scopedBranches.filter((branch) => branch.status === '待处理')
  const closedBranches = scopedBranches.filter((branch) => branch.status !== '待处理')
  const sample = samples.find((item) => item.id === scopeSampleId)
  const canSync = scopedChanges.length > 0 && sample?.status !== '已锁定'

  return (
    <Box className="panel" sx={{ mt: 1.5 }}>
      <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1.2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Stack direction="row" spacing={0.8} alignItems="center">
          <MergeOutlinedIcon color="primary" />
          <Typography fontWeight={800}>协同合并中心</Typography>
          <Chip size="small" label={sample ? `当前版本 v${sample.version}` : '全部款式'} variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={0.6} alignItems="center">
            <PersonOutlineIcon fontSize="small" color="action" />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={currentUser}
                onChange={(event) => dispatch(setCurrentUser(event.target.value))}
                sx={{ fontSize: 12.5, '.MuiSelect-select': { py: 0.7 } }}
              >
                {teamMembers.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <Chip
            size="small"
            icon={online ? <CloudSyncOutlinedIcon /> : <CloudOffOutlinedIcon />}
            color={online ? 'success' : 'warning'}
            label={online ? '在线' : '离线'}
            onClick={() => dispatch(setOnline(!online))}
          />
          <Switch size="small" checked={online} onChange={(event) => dispatch(setOnline(event.target.checked))} />
          <Button
            size="small"
            variant="contained"
            disabled={!canSync}
            startIcon={<CloudSyncOutlinedIcon />}
            onClick={() => dispatch(syncChanges(scopeSampleId ? { sampleId: scopeSampleId } : {}))}
          >
            同步合并（{scopedChanges.length} 项暂存）
          </Button>
          <Button size="small" variant="outlined" disabled={!sample || sample.status === '已锁定'} onClick={() => sample && dispatch(simulatePeerSubmit({ sampleId: sample.id }))}>
            模拟协作者后保存
          </Button>
        </Stack>
      </Box>

      <Box sx={{ p: 2, display: 'grid', gap: 1.5 }}>
        {!online && (
          <Alert severity="warning" icon={<CloudOffOutlinedIcon />}>
            离线模式：所有改动以“提交人 + 基准版本 v{sample?.version}”暂存，恢复在线后按字段三方合并；同步失败会生成待处理分支。
          </Alert>
        )}

        {scopedChanges.length > 0 && (
          <Box>
            <Typography fontWeight={800} fontSize={12.5} mb={0.8}>本次离线暂存（{scopedChanges.length}）</Typography>
            <Stack spacing={0.8}>
              {scopedChanges.map((change) => (
                <Box key={change.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, borderRadius: 1, bgcolor: '#f7f5f0' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap mb={0.3}>
                      <Chip size="small" label={change.module} variant="outlined" sx={{ height: 19, fontSize: 10 }} />
                      <Typography fontSize={11.5} fontWeight={800}>{change.label}</Typography>
                      <Chip size="small" label={`基准 v${change.baseVersion}`} sx={{ height: 19, fontSize: 10 }} />
                      <Typography fontSize={10.5} color="text.secondary">{change.author} · {change.at}</Typography>
                    </Stack>
                    <Typography fontSize={11.5} color="text.secondary" sx={{ textDecoration: 'line-through', opacity: 0.75 }}>{change.oldValue || '（空）'}</Typography>
                    <Typography fontSize={12} fontWeight={700}>→ {change.appendItem ? `追加批注「${change.appendItem.part}」：${change.appendItem.content}` : change.newValue || '（空）'}</Typography>
                  </Box>
                  <Tooltip title="撤回该暂存">
                    <Button size="small" color="inherit" sx={{ minWidth: 0, px: 0.8 }} onClick={() => dispatch(undoStaged(change.id))}>
                      <UndoOutlinedIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {pendingBranches.length > 0 && (
          <Box>
            <Typography fontWeight={800} fontSize={12.5} mb={0.8}>待处理分支（{pendingBranches.length}）· 冲突逐条取舍后重试，或放弃</Typography>
            <Stack spacing={1}>
              {pendingBranches.map((branch) => <BranchCard key={branch.id} branch={branch} />)}
            </Stack>
          </Box>
        )}

        {closedBranches.length > 0 && (
          <Box>
            <Button size="small" color="inherit" endIcon={<ExpandMoreOutlinedIcon sx={{ transform: showClosed ? 'rotate(180deg)' : 'none' }} />} onClick={() => setShowClosed((value) => !value)}>
              已结束分支（{closedBranches.length}）
            </Button>
            <Collapse in={showClosed}>
              <Stack spacing={0.8} mt={0.8}>
                {closedBranches.map((branch) => <BranchCard key={branch.id} branch={branch} />)}
              </Stack>
            </Collapse>
          </Box>
        )}

        {scopedChanges.length === 0 && pendingBranches.length === 0 && (
          <Typography fontSize={12} color="text.secondary">
            暂无离线改动或待处理分支。可切换离线后修改字段，或点击「模拟协作者后保存」制造基准过期与同字段冲突。
          </Typography>
        )}
      </Box>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4200}
        onClose={() => dispatch(clearToast())}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? <Alert severity={toast.severity} onClose={() => dispatch(clearToast())} variant="filled">{toast.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  )
}
