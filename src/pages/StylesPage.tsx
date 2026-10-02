import { useState } from 'react'
import { Box, Button, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { commitEdit, selectSample, selectViewSample } from '../features/developmentSlice'
import BranchAlert from '../components/BranchAlert'

function EditableField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  if (!editing) {
    return (
      <>
        <Typography color="text.secondary">{label}</Typography>
        <Typography
          onClick={() => !disabled && setEditing(true)}
          sx={{ cursor: disabled ? 'default' : 'text', borderBottom: '1px dashed transparent', '&:hover': { borderBottomColor: '#b9c4c1' } }}
        >
          {value}
        </Typography>
      </>
    )
  }
  return (
    <>
      <Typography color="text.secondary">{label}</Typography>
      <TextField
        size="small"
        autoFocus
        defaultValue={value}
        disabled={disabled}
        onBlur={(e) => {
          setEditing(false)
          if (e.target.value.trim() && e.target.value !== value) onCommit(e.target.value.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
        sx={{ '& .MuiInputBase-input': { fontSize: 13, py: 0.4 } }}
      />
    </>
  )
}

export default function StylesPage() {
  const dispatch = useAppDispatch()
  const { samples, selectedId } = useAppSelector((state) => state.development)
  const selected = useAppSelector((root) => selectViewSample(root.development, root.development.selectedId))
  const locked = selected.status === '已锁定'

  const commitField = (field: string, label: string, value: string) => {
    dispatch(commitEdit({ sampleId: selected.id, changeset: { [field]: value }, summary: `修改${label}` }))
  }

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">STYLE FILES / 款式档案</Typography>
          <Typography component="h1" fontWeight={800}>规格、物料与样品轮次</Typography>
          <Typography color="text.secondary">每次修改带提交人与基准版本，离线改动回来按字段自动合并，冲突留两份。</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddPhotoAlternateOutlinedIcon />}>新建款式档案</Button>
      </Box>

      <BranchAlert sampleId={selected.id} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0,1fr)' }, gap: 1.5 }}>
        <Box className="panel" sx={{ overflow: 'hidden' }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid #ece9e4' }}>
            <TextField select size="small" fullWidth label="开发季节" defaultValue="2026 秋冬">
              <MenuItem value="2026 秋冬">2026 秋冬</MenuItem>
              <MenuItem value="2027 春夏">2027 春夏</MenuItem>
            </TextField>
          </Box>
          {samples.map((sample) => (
            <Button
              key={sample.id}
              onClick={() => dispatch(selectSample(sample.id))}
              sx={{
                display: 'block',
                width: '100%',
                p: 1.5,
                borderRadius: 0,
                textAlign: 'left',
                textTransform: 'none',
                borderBottom: '1px solid #efede9',
                bgcolor: sample.id === selected.id ? '#edf4f1' : 'transparent',
                boxShadow: sample.id === selected.id ? 'inset 3px 0 #2d7b72' : 'none',
              }}
            >
              <Typography fontWeight={800} fontSize={13}>{sample.styleCode}</Typography>
              <Typography fontSize={13} mt={0.3}>{sample.styleName}</Typography>
              <Stack direction="row" spacing={0.6} mt={0.8}>
                <Chip size="small" label={sample.owner} />
                <Chip size="small" label={sample.status} color={sample.status === '待审核' ? 'warning' : 'default'} />
              </Stack>
            </Button>
          ))}
        </Box>

        <Box className="panel">
          <Box sx={{ p: 2, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
            <Box>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <Typography color="text.secondary" fontSize={11}>{selected.id} · {selected.developmentSeason}</Typography>
                <Chip size="small" variant="outlined" label={`v${selected.version}`} sx={{ height: 18, fontSize: 10 }} />
              </Stack>
              <Typography fontSize={22} fontWeight={850} mt={0.5}>{selected.styleName}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={selected.category} />
              <Chip label={selected.status} color={selected.status === '已锁定' ? 'success' : 'warning'} />
            </Stack>
          </Box>
          <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography fontWeight={800} mb={1}>开发信息{locked ? '（审核锁定，只读）' : '（点击可改，离线自动合并）'}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 1, fontSize: 13, alignItems: 'center' }}>
                <EditableField label="供应商" value={selected.supplier} disabled={locked} onCommit={(v) => commitField('supplier', '供应商', v)} />
                <EditableField label="负责人" value={selected.owner} disabled={locked} onCommit={(v) => commitField('owner', '负责人', v)} />
                <EditableField label="面辅料" value={selected.fabric} disabled={locked} onCommit={(v) => commitField('fabric', '面辅料', v)} />
                <EditableField label="色卡" value={selected.colorway} disabled={locked} onCommit={(v) => commitField('colorway', '色卡', v)} />
                <EditableField label="计划交样" value={selected.dueDate} disabled={locked} onCommit={(v) => commitField('dueDate', '计划交样', v)} />
              </Box>
            </Box>
            <Box>
              <Typography fontWeight={800} mb={1}>工艺要求</Typography>
              <Stack spacing={0.8}>
                {selected.craft.map((item, index) => (
                  <Box key={item} sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, bgcolor: '#f7f6f3', borderRadius: 1 }}>
                    <Chip size="small" label={`工艺 ${index + 1}`} />
                    <Typography fontSize={12}>{item}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography fontWeight={800} mb={1.2}>样衣轮次与附件</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, gap: 1 }}>
              {(['第一轮', '第二轮', '第三轮'] as const).map((round) => (
                <Box key={round} sx={{ p: 1.5, border: '1px solid #e3e0db', borderRadius: 1 }}>
                  <Typography fontWeight={800} fontSize={13}>{round}</Typography>
                  <Typography color="text.secondary" fontSize={11} mt={0.5}>
                    {selected.measurements[round].length} 项实测 · {round === '第三轮' ? '当前评测' : '历史记录'}
                  </Typography>
                  <Button size="small" sx={{ mt: 1 }}>查看实测</Button>
                </Box>
              ))}
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap" mt={1.5}>
              {selected.attachments.map((file) => (
                <Button key={file.name} variant="outlined" size="small" startIcon={<DescriptionOutlinedIcon />}>{file.name}</Button>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
