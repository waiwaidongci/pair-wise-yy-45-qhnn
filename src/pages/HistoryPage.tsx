import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LockOutlineIcon from '@mui/icons-material/LockOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { lockReview, restoreVersion, selectViewSample, unlockReview } from '../features/developmentSlice'
import BranchAlert from '../components/BranchAlert'

export default function HistoryPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = useAppSelector((root) => selectViewSample(root.development, root.development.selectedId))
  const versions = useAppSelector((root) => root.development.versions[sample.id] ?? [])
  const history = useAppSelector((root) => root.development.history.filter((h) => h.sampleId === sample.id))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const locked = sample.status === '已锁定'
  const pendingAnnotations = sample.annotations.filter((item) => item.status === '待处理').length
  const pendingProposals = sample.proposals.filter((item) => item.status === '待决定').length
  const canLock = pendingAnnotations === 0 && pendingProposals === 0

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">AUDIT TRAIL / 修订历史</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 审核与锁定</Typography>
          <Typography color="text.secondary">每次提交、合并、冲突取舍与还原均保留提交人、基准版本与取舍明细。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined">导出修订记录</Button>
          {locked ? (
            <Button variant="outlined" startIcon={<LockOpenOutlinedIcon />} onClick={() => dispatch(unlockReview())}>解锁修订</Button>
          ) : (
            <Button variant="contained" startIcon={<LockOutlineIcon />} onClick={() => setConfirmOpen(true)} disabled={!canLock}>审核锁定</Button>
          )}
        </Stack>
      </Box>

      <BranchAlert sampleId={sample.id} />
      {!canLock && !locked && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          审核前需处理 {pendingAnnotations} 项待处理批注和 {pendingProposals} 项待决定改版方案。
        </Alert>
      )}
      {locked && <Alert severity="success" sx={{ mb: 1.5 }}>当前轮次已锁定，只能查看历史。解锁后将新增一个修订分支。</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 320px' }, gap: 1.5 }}>
        <Box className="panel" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <HistoryOutlinedIcon color="primary" />
            <Typography fontWeight={800}>完整审计时间线</Typography>
          </Stack>
          <Box>
            {history.map((event) => (
              <Box key={event.id} sx={{ display: 'grid', gridTemplateColumns: '120px 24px 1fr', gap: 1 }}>
                <Typography color="text.secondary" fontSize={11} pt={0.6}>{event.at}</Typography>
                <Box sx={{ position: 'relative', '&:before': { content: '""', position: 'absolute', left: 8, top: 8, bottom: -8, width: 1, bgcolor: '#d5ddd9' }, '&:after': { content: '""', position: 'absolute', left: 4, top: 7, width: 7, height: 7, bgcolor: '#25756d', border: '2px solid #fff', borderRadius: '50%', boxShadow: '0 0 0 1px #25756d' } }} />
                <Box sx={{ pb: 2.2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={800} fontSize={13}>{event.detail}</Typography>
                    <Chip size="small" label={event.action} color={event.action === '冲突挂起' ? 'warning' : event.action === '放弃' ? 'default' : event.action === '还原' ? 'secondary' : 'primary'} />
                  </Stack>
                  <Typography color="#8a918d" fontSize={10} mt={0.5}>
                    {event.by} / {event.role}{event.version ? ` · v${event.version}` : ''}
                  </Typography>
                  {event.choices.length > 0 && (
                    <Box component="ul" sx={{ m: 0, pl: 2.2, mt: 0.4 }}>
                      {event.choices.map((c, i) => (
                        <Typography key={i} component="li" color="text.secondary" fontSize={11}>{c}</Typography>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box className="panel" sx={{ alignSelf: 'start' }}>
          <Box sx={{ p: 1.6, borderBottom: '1px solid #ece9e4' }}>
            <Typography fontWeight={800}>版本快照与还原</Typography>
          </Box>
          <Stack spacing={1.2} p={1.6}>
            {versions.map((v) => {
              const isCurrent = v.version === sample.version
              return (
                <Box key={v.version} sx={{ p: 1.2, border: '1px solid #e4e1dc', borderRadius: 1, bgcolor: isCurrent ? '#edf5f2' : '#fff' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={0.8} alignItems="center">
                      <Typography fontWeight={800} fontSize={13}>v{v.version}</Typography>
                      {isCurrent && <Chip size="small" color="success" label="当前" />}
                    </Stack>
                    {!isCurrent && (
                      <Button size="small" startIcon={<RestoreOutlinedIcon />} onClick={() => dispatch(restoreVersion({ sampleId: sample.id, version: v.version }))}>
                        还原
                      </Button>
                    )}
                  </Stack>
                  <Typography color="text.secondary" fontSize={11} mt={0.4}>{v.summary}</Typography>
                  <Typography color="#8a918d" fontSize={10} mt={0.3}>{v.by} / {v.role} · {v.at}</Typography>
                </Box>
              )
            })}
          </Stack>
          <Box sx={{ px: 1.6, pb: 1.6 }}>
            <Typography color="text.secondary" fontSize={11}>还原会逐字段记录取舍，生成新的版本；审核锁定的方案状态不会被回退。</Typography>
          </Box>
        </Box>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认锁定 {state.roundB}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={1.5}>锁定后本轮尺寸、批注和采纳方案将变为只读，并生成不可覆盖的审核快照。</Typography>
          <TextField fullWidth label="锁定说明" defaultValue={`确认 ${state.roundB} 版型与工艺资料完整，可进入下一阶段。`} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              dispatch(lockReview())
              setConfirmOpen(false)
            }}
          >
            确认锁定
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
