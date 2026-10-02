import { Box, Button, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectSample } from '../features/developmentSlice'
import EditableField from '../components/EditableField'
import MergeCenter from '../components/MergeCenter'

export default function StylesPage() {
  const dispatch = useAppDispatch()
  const { samples, selectedId } = useAppSelector((state) => state.development)
  const selected = samples.find((item) => item.id === selectedId) ?? samples[0]

  return (
    <Box className="page">
      <Box className="page-head">
        <Box>
          <Typography className="eyebrow">STYLE FILES / 款式档案</Typography>
          <Typography component="h1" fontWeight={800}>规格、物料与样品轮次</Typography>
          <Typography color="text.secondary">字段修改自带提交人与基准版本，离线回来按字段合并，不再“后保存覆盖”。</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" variant="outlined" label={`服务端版本 v${selected.version}`} />
          <Button variant="contained" startIcon={<AddPhotoAlternateOutlinedIcon />}>新建款式档案</Button>
        </Stack>
      </Box>

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
              <Stack direction="row" spacing={0.6} mt={0.8} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={sample.owner} />
                <Chip size="small" label={sample.status} color={sample.status === '待审核' ? 'warning' : sample.status === '已锁定' ? 'success' : 'default'} />
                <Chip size="small" variant="outlined" label={`v${sample.version}`} />
              </Stack>
            </Button>
          ))}
        </Box>

        <Box>
          <Box className="panel">
            <Box sx={{ p: 2, borderBottom: '1px solid #ece9e4', display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
              <Box>
                <Typography color="text.secondary" fontSize={11}>{selected.id} · {selected.developmentSeason}</Typography>
                <Typography fontSize={22} fontWeight={850} mt={0.5}>{selected.styleName}</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={selected.category} />
                <Chip label={selected.status} color={selected.status === '已锁定' ? 'success' : 'warning'} />
                <Chip size="small" variant="outlined" label={`基准版本 v${selected.version}`} />
              </Stack>
            </Box>
            <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <Box>
                <Typography fontWeight={800} mb={1}>开发信息（点击字段即可离线编辑）</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.1 }}>
                  <EditableField sampleId={selected.id} field="supplier" label="供应商" />
                  <EditableField sampleId={selected.id} field="owner" label="负责人" />
                  <EditableField sampleId={selected.id} field="fabric" label="面辅料" />
                  <EditableField sampleId={selected.id} field="colorway" label="色卡" />
                  <EditableField sampleId={selected.id} field="dueDate" label="计划交样" />
                </Box>
              </Box>
              <Box>
                <Typography fontWeight={800} mb={1}>工艺要求（多行，逐行合并）</Typography>
                <EditableField sampleId={selected.id} field="craft" label="工艺要求（每行一条）" multiline />
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

          <MergeCenter scopeSampleId={selected.id} />
        </Box>
      </Box>
    </Box>
  )
}
