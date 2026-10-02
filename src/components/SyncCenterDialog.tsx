import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import CallMergeOutlinedIcon from '@mui/icons-material/CallMergeOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  abandonBranch,
  assignBranch,
  closeSyncCenter,
  resolveBranch,
  retryBranch,
  syncOutbox,
} from '../features/developmentSlice'
import { stringifyVal } from '../lib/mergeEngine'

const ASSIGNEES = ['沈岚', '周研', '陈曼', '顾恺']

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  return value === index ? <Box sx={{ pt: 1.5 }}>{children}</Box> : null
}

export default function SyncCenterDialog() {
  const dispatch = useAppDispatch()
  const { open, sampleFilter, outbox, branches, history, samples } = useAppSelector((s) => ({
    open: s.development.syncCenterOpen,
    sampleFilter: s.development.syncCenterSample,
    outbox: s.development.outbox,
    branches: s.development.branches,
    history: s.development.history,
    samples: s.development.samples,
  }))
  const [tab, setTab] = useState(0)
  const [resolution, setResolution] = useState<Record<string, Record<string, 'current' | 'incoming'>>>({})

  const pendingOutbox = useMemo(() => outbox.filter((op) => op.status === '待同步'), [outbox])
  const activeBranches = useMemo(
    () => branches.filter((b) => b.status === '待处理' && (!sampleFilter || b.sampleId === sampleFilter)),
    [branches, sampleFilter],
  )
  const visibleHistory = useMemo(
    () => (sampleFilter ? history.filter((h) => h.sampleId === sampleFilter) : history),
    [history, sampleFilter],
  )

  useEffect(() => {
    if (open) {
      setTab(activeBranches.length > 0 ? 1 : pendingOutbox.length > 0 ? 0 : 2)
      setResolution({})
    }
  }, [open, activeBranches.length, pendingOutbox.length])

  const sampleName = (id: string) => samples.find((s) => s.id === id)?.styleName ?? id

  const choiceFor = (branchId: string, path: string): 'current' | 'incoming' =>
    resolution[branchId]?.[path] ?? 'current'

  const setChoice = (branchId: string, path: string, choice: 'current' | 'incoming') => {
    setResolution((prev) => ({
      ...prev,
      [branchId]: { ...prev[branchId], [path]: choice },
    }))
  }

  return (
    <Dialog open={open} onClose={() => dispatch(closeSyncCenter())} fullWidth maxWidth="md">
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CloudSyncOutlinedIcon color="primary" />
          <Typography fontWeight={800}>同步与协同中心</Typography>
          {sampleFilter && <Chip size="small" label={sampleName(sampleFilter)} onDelete={() => dispatch(closeSyncCenter())} />}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<CloudSyncOutlinedIcon />} iconPosition="start" label={`待同步 (${pendingOutbox.length})`} />
          <Tab icon={<CallMergeOutlinedIcon />} iconPosition="start" label={`待处理分支 (${activeBranches.length})`} />
          <Tab icon={<HistoryOutlinedIcon />} iconPosition="start" label="历史记录" />
        </Tabs>

        <TabPanel value={tab} index={0}>
          {pendingOutbox.length === 0 ? (
            <Typography color="text.secondary" fontSize={13} py={2}>没有待同步的离线改动。</Typography>
          ) : (
            <Stack spacing={1.2}>
              {pendingOutbox.map((op) => (
                <Box key={op.id} sx={{ p: 1.3, border: '1px solid #e3e0db', borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                    <Typography fontWeight={800} fontSize={13}>{op.summary}</Typography>
                    <Chip size="small" label={`基准 v${op.baseVersion}`} />
                  </Stack>
                  <Typography color="text.secondary" fontSize={11} mt={0.4}>
                    {sampleName(op.sampleId)} · {op.author} / {op.role} · {op.createdAt}
                  </Typography>
                  <Stack direction="row" gap={0.6} mt={0.8} flexWrap="wrap">
                    {Object.keys(op.changeset).map((p) => (
                      <Chip key={p} size="small" variant="outlined" label={p} sx={{ fontFamily: 'monospace', fontSize: 10 }} />
                    ))}
                  </Stack>
                </Box>
              ))}
              <Box>
                <Button variant="contained" startIcon={<CloudSyncOutlinedIcon />} onClick={() => dispatch(syncOutbox())}>
                  全部同步并合并
                </Button>
              </Box>
            </Stack>
          )}
        </TabPanel>

        <TabPanel value={tab} index={1}>
          {activeBranches.length === 0 ? (
            <Typography color="text.secondary" fontSize={13} py={2}>没有待处理分支。同步失败的改动会留在这里，可指派责任人重试或放弃。</Typography>
          ) : (
            <Stack spacing={1.6}>
              {activeBranches.map((branch) => {
                const op = outbox.find((o) => o.id === branch.opId)
                const res = resolution[branch.id] ?? {}
                return (
                  <Box key={branch.id} sx={{ p: 1.5, border: '1px solid #e3e0db', borderRadius: 1.2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                      <Stack direction="row" spacing={0.8} alignItems="center">
                        <Typography fontWeight={800} fontSize={13}>{op?.summary ?? '离线改动'}</Typography>
                        <Chip
                          size="small"
                          color={branch.reason === 'conflict' ? 'warning' : 'default'}
                          label={branch.reason === 'conflict' ? '字段冲突' : '审核锁定保留'}
                        />
                      </Stack>
                      <Typography color="text.secondary" fontSize={11}>
                        {sampleName(branch.sampleId)} · {branch.createdAt}
                      </Typography>
                    </Stack>
                    <Typography color="text.secondary" fontSize={11} mt={0.4}>
                      提交人：{op?.author} / {op?.role} · 基准 v{op?.baseVersion}
                      {branch.assignee ? ` · 责任人：${branch.assignee}` : ' · 未指派'}
                    </Typography>

                    {branch.conflicts.length > 0 && (
                      <Stack spacing={1.2} mt={1.2}>
                        {branch.conflicts.map((c) => (
                          <Box key={c.path} sx={{ border: '1px solid #ece9e4', borderRadius: 1, p: 1.2 }}>
                            <Typography fontWeight={800} fontSize={12} mb={0.8}>{c.label}</Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                              <Box sx={{ flex: 1, p: 1, border: '1px solid #d5ddd9', borderRadius: 1, bgcolor: '#f4f8f6' }}>
                                <Chip size="small" label={`当前 · ${c.currentSource}`} sx={{ mb: 0.6 }} />
                                <Typography fontSize={13} sx={{ wordBreak: 'break-all' }}>{stringifyVal(c.currentValue)}</Typography>
                              </Box>
                              <Box sx={{ flex: 1, p: 1, border: '1px solid #ecd9c6', borderRadius: 1, bgcolor: '#fdf6ef' }}>
                                <Chip size="small" color="warning" label={`离线 · ${c.incomingSource}`} sx={{ mb: 0.6 }} />
                                <Typography fontSize={13} sx={{ wordBreak: 'break-all' }}>{stringifyVal(c.incomingValue)}</Typography>
                              </Box>
                            </Stack>
                            <RadioGroup
                              row
                              value={choiceFor(branch.id, c.path)}
                              onChange={(e) => setChoice(branch.id, c.path, e.target.value as 'current' | 'incoming')}
                            >
                              <FormControlLabel value="current" control={<Radio size="small" />} label={<Typography fontSize={12}>保留当前版本</Typography>} />
                              <FormControlLabel value="incoming" control={<Radio size="small" />} label={<Typography fontSize={12}>采用离线版本</Typography>} />
                            </RadioGroup>
                          </Box>
                        ))}
                      </Stack>
                    )}

                    {branch.preserved.length > 0 && (
                      <Box mt={1.2}>
                        <Typography color="text.secondary" fontSize={11} mb={0.4}>以下内容因审核锁定 / 已定方案照常保留，未被覆盖：</Typography>
                        <Stack direction="row" gap={0.6} flexWrap="wrap">
                          {branch.preserved.map((p) => (
                            <Chip key={p.path} size="small" variant="outlined" label={`${p.label}（${stringifyVal(p.currentValue)}）· ${p.source}`} sx={{ fontSize: 11 }} />
                          ))}
                        </Stack>
                      </Box>
                    )}

                    <Divider sx={{ my: 1.2 }} />
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1}>
                      <FormControl size="small" sx={{ minWidth: 130 }}>
                        <TextField
                          select
                          size="small"
                          label="指派责任人"
                          value={branch.assignee ?? ''}
                          onChange={(e) => dispatch(assignBranch({ branchId: branch.id, assignee: e.target.value }))}
                        >
                          {ASSIGNEES.map((a) => (
                            <MenuItem key={a} value={a}>{a}</MenuItem>
                          ))}
                        </TextField>
                      </FormControl>
                      <Button size="small" variant="outlined" onClick={() => dispatch(retryBranch(branch.id))}>重试合并</Button>
                      <Button size="small" color="inherit" onClick={() => dispatch(abandonBranch(branch.id))}>放弃</Button>
                      <Box sx={{ flex: 1 }} />
                      <Button
                        size="small"
                        variant="contained"
                        disabled={branch.conflicts.length === 0}
                        onClick={() => dispatch(resolveBranch({ branchId: branch.id, resolution: res }))}
                      >
                        处理完成并记录取舍
                      </Button>
                    </Stack>
                  </Box>
                )
              })}
            </Stack>
          )}
        </TabPanel>

        <TabPanel value={tab} index={2}>
          {visibleHistory.length === 0 ? (
            <Typography color="text.secondary" fontSize={13} py={2}>暂无历史。</Typography>
          ) : (
            <Stack spacing={0.8}>
              {visibleHistory.map((h) => (
                <Box key={h.id} sx={{ p: 1, borderBottom: '1px solid #efede9' }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip size="small" label={h.action} color={h.action === '冲突挂起' ? 'warning' : h.action === '放弃' ? 'default' : 'primary'} />
                    <Typography fontWeight={800} fontSize={12}>{h.detail}</Typography>
                  </Stack>
                  <Typography color="text.secondary" fontSize={11} mt={0.3}>
                    {sampleName(h.sampleId)} · {h.by} / {h.role} · {h.at}{h.version ? ` · v${h.version}` : ''}
                  </Typography>
                  {h.choices.length > 0 && (
                    <Box component="ul" sx={{ m: 0, pl: 2.2, mt: 0.4 }}>
                      {h.choices.map((c, i) => (
                        <Typography key={i} component="li" color="text.secondary" fontSize={11}>{c}</Typography>
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => dispatch(closeSyncCenter())}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
