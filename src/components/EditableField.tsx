import { useState } from 'react'
import { Box, Chip, Stack, TextField, Typography } from '@mui/material'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { stageChange } from '../features/developmentSlice'
import { getAdapter } from '../features/mergeEngine'

/**
 * 款式档案内联字段：每个字段独立编辑、独立暂存。
 * 提交时自带当前用户与该样衣的基准版本号，是三方合并的最小操作单元。
 */
export default function EditableField({
  sampleId,
  field,
  label,
  multiline = false,
}: {
  sampleId: string
  field: string
  label: string
  multiline?: boolean
}) {
  const dispatch = useAppDispatch()
  const sample = useAppSelector((state) => state.development.samples.find((item) => item.id === sampleId))
  const currentUser = useAppSelector((state) => state.development.currentUser)
  const staged = useAppSelector((state) =>
    state.development.pendingChanges.find((change) => change.sampleId === sampleId && change.field === field),
  )
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  if (!sample) return null
  const adapter = getAdapter(field)
  if (!adapter) return null
  const locked = sample.status === '已锁定'
  const display = staged?.newValue ?? adapter.read(sample)

  const startEdit = () => {
    setValue(staged?.newValue ?? adapter.read(sample))
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (value !== adapter.read(sample) || staged) {
      dispatch(stageChange({ sampleId, field, newValue: value }))
    }
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.6} alignItems="center" mb={0.4} flexWrap="wrap" useFlexGap>
        <Typography color="text.secondary" fontSize={11.5} fontWeight={700}>{label}</Typography>
        {!locked && <EditOutlinedIcon sx={{ fontSize: 12, color: '#9b948d', opacity: 0.6, cursor: 'pointer' }} onClick={startEdit} />}
        {staged && <Chip size="small" label={`暂存 · 基准 v${staged.baseVersion} · ${currentUser}`} sx={{ height: 17, fontSize: 9.5 }} color="warning" variant="outlined" />}
      </Stack>
      {editing && !locked ? (
        <TextField
          autoFocus
          size="small"
          fullWidth
          multiline={multiline}
          minRows={multiline ? 2 : 1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !multiline) commit()
            if (event.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <Typography
          onClick={() => !locked && startEdit()}
          sx={{
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            cursor: locked ? 'default' : 'pointer',
            borderRadius: 0.6,
            px: 0.4,
            py: 0.2,
            mx: -0.4,
            color: staged ? '#9a6a3c' : 'text.primary',
            bgcolor: staged ? 'rgba(192,105,47,.07)' : 'transparent',
            '&:hover': locked ? undefined : { bgcolor: staged ? 'rgba(192,105,47,.1)' : '#f4f2ee' },
          }}
        >
          {display || '—'}
        </Typography>
      )}
    </Box>
  )
}
