import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined'
import PhotoCameraBackOutlinedIcon from '@mui/icons-material/PhotoCameraBackOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setRounds, stageChange, toggleAnnotation } from '../features/developmentSlice'
import MergeCenter from '../components/MergeCenter'

const rounds = ['第一轮', '第二轮', '第三轮'] as const

export default function SampleReviewPage() {
  const dispatch = useAppDispatch()
  const state = useAppSelector((root) => root.development)
  const sample = state.samples.find((item) => item.id === state.selectedId) ?? state.samples[0]
  const locked = sample.status === '已锁定'
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [decisionDialog, setDecisionDialog] = useState<string | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [annotationDraft, setAnnotationDraft] = useState({ x: 50, y: 42, part: '版型', content: '' })
  const imageRef = useRef<HTMLDivElement>(null)

  const stagedAnnotations = state.pendingChanges
    .filter((change) => change.sampleId === sample.id && change.appendItem)
    .map((change) => change.appendItem!)
  const stagedFieldSet = new Set(
    state.pendingChanges.filter((change) => change.sampleId === sample.id).map((change) => change.field),
  )

  const comparison = useMemo(() => {
    const a = sample.measurements[state.roundA]
    const b = sample.measurements[state.roundB]
    return a.map((item, index) => ({
      ...item,
      previous: item.actual,
      current: b[index].actual,
      delta: b[index].actual - item.actual,
      inTolerance: Math.abs(b[index].actual - b[index].spec) <= b[index].tolerance,
    }))
  }, [sample, state.roundA, state.roundB])

  const handleImageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return
    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnnotationDraft((current) => ({
      ...current,
      x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
    }))
    setAnnotationOpen(true)
  }

  const submitAnnotation = () => {
    // 批注是“追加”操作：带提交人与基准版本，合并时按 id 并集，双方批注互不覆盖
    dispatch(
      stageChange({
        sampleId: sample.id,
        field: 'annotations',
        newValue: annotationDraft.content,
        appendItem: {
          id: `AN-${Date.now()}`,
          x: annotationDraft.x,
          y: annotationDraft.y,
          part: annotationDraft.part,
          content: annotationDraft.content,
          author: state.currentUser,
          status: '待处理',
        },
      }),
    )
    setAnnotationDraft({ x: 50, y: 42, part: '版型', content: '' })
    setAnnotationOpen(false)
  }

  const submitDecision = (decision: '已采纳' | '未采纳') => {
    if (!decisionDialog || !decisionReason.trim()) return
    dispatch(
      stageChange({
        sampleId: sample.id,
        field: `proposal:${decisionDialog}:status`,
        newValue: decision,
        note: decisionReason,
      }),
    )
    setDecisionDialog(null)
    setDecisionReason('')
  }

  const stagedDecisionFor = (proposalId: string) =>
    state.pendingChanges.find((change) => change.sampleId === sample.id && change.field === `proposal:${proposalId}:status`)

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">SAMPLE REVIEW / 样品评审</Typography>
          <Typography component="h1" fontWeight={800}>{sample.styleCode} · 轮次对比</Typography>
          <Typography color="text.secondary">批注、方案决定均带提交人与基准版本；离线回来后未冲突自动合入、同字段冲突留两份。</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PhotoCameraBackOutlinedIcon />}>上传样衣照片</Button>
          <Chip size="small" variant="outlined" label={`基准版本 v${sample.version}`} />
        </Stack>
      </Box>

      {locked && <Alert severity="success" sx={{ mb: 1.5 }}>该轮次已审核锁定，批注、方案与档案资料只读保留。解锁后新开修订版本才能改动。</Alert>}
      {sample.annotations.some((item) => item.status === '待处理') && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          当前仍有 {sample.annotations.filter((item) => item.status === '待处理').length} 项待处理批注，审核锁定前必须逐项关闭。
        </Alert>
      )}
      {stagedAnnotations.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          有 {stagedAnnotations.length} 条批注已暂存（基准 v{sample.version}，提交人 {state.currentUser}），同步合并后才写入服务端。
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0,1.15fr) minmax(340px,.85fr)' }, gap: 1.5 }}>
        <Box className="panel">
          <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontWeight={800}>尺寸实测差异</Typography>
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>基准轮次</InputLabel>
                <Select label="基准轮次" value={state.roundA} onChange={(event) => dispatch(setRounds({ a: event.target.value as typeof state.roundA }))}>
                  {rounds.map((round) => <MenuItem key={round} value={round}>{round}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>对比轮次</InputLabel>
                <Select label="对比轮次" value={state.roundB} onChange={(event) => dispatch(setRounds({ b: event.target.value as typeof state.roundB }))}>
                  {rounds.map((round) => <MenuItem key={round} value={round}>{round}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          </Box>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 620 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f6f5f2' }}>
                  <TableCell>部位</TableCell>
                  <TableCell>规格</TableCell>
                  <TableCell>±容差</TableCell>
                  <TableCell>{state.roundA}</TableCell>
                  <TableCell>{state.roundB}</TableCell>
                  <TableCell>变化</TableCell>
                  <TableCell>判定</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.map((item) => (
                  <TableRow key={item.key} sx={{ bgcolor: item.inTolerance ? 'transparent' : '#fff4ef' }}>
                    <TableCell sx={{ fontWeight: 750 }}>{item.name}</TableCell>
                    <TableCell>{item.spec} cm</TableCell>
                    <TableCell>±{item.tolerance}</TableCell>
                    <TableCell>{item.previous.toFixed(1)}</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: item.inTolerance ? '#2d7665' : '#b44b2d' }}>{item.current.toFixed(1)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={`${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}`} color={Math.abs(item.delta) > 0.5 ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={item.inTolerance ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />} label={item.inTolerance ? '达标' : '超差'} color={item.inTolerance ? 'success' : 'error'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ p: 1.5, borderTop: '1px solid #ece9e4' }}>
            <TextField
              key={sample.id}
              multiline
              minRows={2}
              fullWidth
              size="small"
              label={`轮次评审草稿（失焦暂存 · 提交人 ${state.currentUser} · 基准 v${sample.version}）`}
              defaultValue={sample.draftNotes ?? ''}
              onBlur={(event) => {
                if (event.target.value !== (sample.draftNotes ?? '')) {
                  dispatch(stageChange({ sampleId: sample.id, field: 'draftNotes', newValue: event.target.value }))
                }
              }}
              disabled={locked}
            />
            {stagedFieldSet.has('draftNotes') && (
              <Typography fontSize={10.5} color="#9a6a3c" mt={0.5}>草稿改动已暂存，等待同步合并。</Typography>
            )}
          </Box>
        </Box>

        <Box className="panel">
          <Box sx={{ px: 1.8, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between' }}>
            <Typography fontWeight={800}>样衣部位批注 · {state.roundB}</Typography>
            <Button size="small" startIcon={<AddLocationAltOutlinedIcon />} disabled={locked} onClick={() => setAnnotationOpen(true)}>添加批注</Button>
          </Box>
          <Box
            ref={imageRef}
            onClick={handleImageClick}
            sx={{
              position: 'relative',
              height: 420,
              m: 1.5,
              overflow: 'hidden',
              cursor: locked ? 'default' : 'crosshair',
              borderRadius: 1.5,
              background: 'linear-gradient(180deg,#dfe5e4 0%,#cbd4d1 100%)',
              backgroundImage: 'linear-gradient(180deg,#dce4e2 0%,#c7d2cf 100%), repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.18) 40px)',
            }}
          >
            <Box sx={{ position: 'absolute', left: '50%', top: 32, transform: 'translateX(-50%)', width: 170, height: 55, border: '3px solid #526a65', borderRadius: '50% 50% 22% 22%', bgcolor: '#657d77' }} />
            <Box sx={{ position: 'absolute', left: '50%', top: 80, transform: 'translateX(-50%)', width: 210, height: 230, border: '3px solid #526a65', borderRadius: '38px 38px 22px 22px', bgcolor: '#718983' }}>
              <Box sx={{ position: 'absolute', left: 50, top: 72, width: 110, height: 76, border: '1px dashed rgba(255,255,255,.6)', borderRadius: 2 }} />
              <Box sx={{ position: 'absolute', left: 35, top: 30, right: 35, borderTop: '2px solid rgba(255,255,255,.45)' }} />
              <Box sx={{ position: 'absolute', left: 38, top: 148, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
              <Box sx={{ position: 'absolute', right: 38, top: 148, width: 34, height: 48, border: '2px solid #455c57', borderRadius: 1 }} />
            </Box>
            <Box sx={{ position: 'absolute', left: 50, top: 96, width: 52, height: 200, border: '3px solid #526a65', borderRadius: '25px 8px 12px 25px', bgcolor: '#657d77', transform: 'rotate(7deg)' }} />
            <Box sx={{ position: 'absolute', right: 50, top: 96, width: 52, height: 200, border: '3px solid #526a65', borderRadius: '8px 25px 25px 12px', bgcolor: '#657d77', transform: 'rotate(-7deg)' }} />
            {[...sample.annotations, ...stagedAnnotations].map((annotation) => {
              const staged = !sample.annotations.includes(annotation)
              return (
                <Tooltip key={annotation.id} title={`${annotation.part}：${annotation.content}${staged ? '（待同步）' : ''}`}>
                  <Box
                    onClick={(event) => {
                      event.stopPropagation()
                      dispatch(toggleAnnotation(state.activeAnnotation === annotation.id ? null : annotation.id))
                    }}
                    sx={{
                      position: 'absolute',
                      left: `${annotation.x}%`,
                      top: `${annotation.y}%`,
                      width: 24,
                      height: 24,
                      display: 'grid',
                      placeItems: 'center',
                      transform: 'translate(-50%,-50%)',
                      borderRadius: '50%',
                      color: '#fff',
                      bgcolor: staged ? '#d8932e' : annotation.status === '待处理' ? '#cf6236' : '#397c69',
                      border: '3px dashed rgba(255,255,255,.95)',
                      boxShadow: '0 3px 10px rgba(0,0,0,.25)',
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {staged ? '…' : annotation.id.slice(-2)}
                  </Box>
                </Tooltip>
              )
            })}
            <Chip label={locked ? '轮次已锁定' : '点击样衣任意部位添加批注（带基准版本）'} size="small" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: 'rgba(255,255,255,.9)' }} />
          </Box>
          <Stack spacing={1} sx={{ px: 1.5, pb: 1.5 }}>
            {[...sample.annotations, ...stagedAnnotations].map((annotation) => {
              const staged = !sample.annotations.includes(annotation)
              return (
                <Box
                  key={annotation.id}
                  sx={{
                    p: 1.2,
                    borderLeft: `3px solid ${staged ? '#d8932e' : annotation.status === '待处理' ? '#cf6236' : '#397c69'}`,
                    bgcolor: staged ? '#fff8ec' : '#f8f7f4',
                    borderRadius: 1,
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography fontWeight={800} fontSize={12}>{annotation.part} · {annotation.author}</Typography>
                    {staged
                      ? <Chip size="small" color="warning" label={`待同步 · 基准 v${sample.version}`} />
                      : <Chip size="small" label={annotation.status} color={annotation.status === '已解决' ? 'success' : 'warning'} />}
                  </Stack>
                  <Typography color="text.secondary" fontSize={11} mt={0.4}>{annotation.content}</Typography>
                </Box>
              )
            })}
          </Stack>
        </Box>
      </Box>

      <Box className="panel" sx={{ mt: 1.5 }}>
        <Box sx={{ px: 2, py: 1.4, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography fontWeight={800}>替代修改方案与采纳决定</Typography>
          <Typography fontSize={11} color="text.secondary">已定方案受保护，离线旧稿不会覆盖；同字段冲突在合并中心留两份。</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 1.5, p: 1.5 }}>
          {sample.proposals.map((proposal) => {
            const stagedDecision = stagedDecisionFor(proposal.id)
            const decided = proposal.status !== '待决定'
            return (
              <Box key={proposal.id} sx={{ p: 1.5, border: '1px solid #e2dfda', borderRadius: 1.2, bgcolor: decided ? '#f5f7f5' : '#fff' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontWeight={800}>{proposal.affectedPart} · {proposal.role}</Typography>
                  {stagedDecision ? (
                    <Chip size="small" color="warning" label={`决定待同步：${stagedDecision.newValue} · 基准 v${stagedDecision.baseVersion}`} />
                  ) : (
                    <Chip size="small" label={proposal.status} color={proposal.status === '已采纳' ? 'success' : proposal.status === '未采纳' ? 'default' : 'warning'} />
                  )}
                </Stack>
                <Typography fontSize={13} mt={1}>{proposal.content}</Typography>
                <Typography color="text.secondary" fontSize={11} mt={0.7}>提交人：{proposal.author}</Typography>
                {stagedDecision?.note && (
                  <Alert severity="info" sx={{ py: 0, mt: 0.8, '& .MuiAlert-message': { py: 0.4, fontSize: 11.5 } }}>
                    决定理由（{state.currentUser}）：{stagedDecision.note}
                  </Alert>
                )}
                {!decided && !stagedDecision && (
                  <Button size="small" variant="outlined" sx={{ mt: 1.2 }} onClick={() => setDecisionDialog(proposal.id)} disabled={locked}>
                    作出决定
                  </Button>
                )}
                {decided && <Typography fontSize={10.5} color="#6f7a75" mt={0.8}>已定方案锁定保留，离线旧稿写入会被合并流程拒绝。</Typography>}
              </Box>
            )
          })}
        </Box>
      </Box>

      <MergeCenter scopeSampleId={sample.id} />

      <Dialog open={annotationOpen} onClose={() => setAnnotationOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>添加部位批注</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} pt={1}>
            <TextField label="详细部位" value={annotationDraft.part} onChange={(event) => setAnnotationDraft({ ...annotationDraft, part: event.target.value })} />
            <TextField multiline minRows={3} label="批注内容" value={annotationDraft.content} onChange={(event) => setAnnotationDraft({ ...annotationDraft, content: event.target.value })} />
            <Typography color="text.secondary" fontSize={12}>批注锚点：{annotationDraft.x}% / {annotationDraft.y}% · 轮次 {state.roundB} · 提交人 {state.currentUser} · 基准 v{sample.version}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnnotationOpen(false)}>取消</Button>
          <Button variant="contained" disabled={!annotationDraft.part.trim() || !annotationDraft.content.trim()} onClick={submitAnnotation}>
            暂存批注（待同步合并）
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(decisionDialog)} onClose={() => setDecisionDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>填写采纳决定说明</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" fontSize={12} mb={1}>
            决定将以“{state.currentUser} · 基准 v{sample.version}”暂存，同步时若该方案已被他人决定，会保留两份冲突并写明来源。
          </Typography>
          <TextField autoFocus multiline minRows={3} fullWidth label="决定理由（必填）" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" disabled={!decisionReason.trim()} startIcon={<CancelOutlinedIcon />} onClick={() => submitDecision('未采纳')}>不采纳</Button>
          <Button variant="contained" disabled={!decisionReason.trim()} startIcon={<CheckCircleOutlineIcon />} onClick={() => submitDecision('已采纳')}>采纳方案</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
