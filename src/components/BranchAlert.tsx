import { Alert, Button, Stack, Typography } from '@mui/material'
import CallMergeOutlinedIcon from '@mui/icons-material/CallMergeOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { openSyncCenter } from '../features/developmentSlice'

/** 当前样衣存在待处理分支时提示，点击打开同步中心并定位到该样衣 */
export default function BranchAlert({ sampleId }: { sampleId: string }) {
  const dispatch = useAppDispatch()
  const branch = useAppSelector((s) =>
    s.development.branches.find((b) => b.status === '待处理' && b.sampleId === sampleId),
  )
  if (!branch) return null
  return (
    <Alert
      severity={branch.reason === 'conflict' ? 'warning' : 'info'}
      sx={{ mb: 1.5 }}
      action={
        <Button color="inherit" size="small" startIcon={<CallMergeOutlinedIcon />} onClick={() => dispatch(openSyncCenter(sampleId))}>
          前往处理
        </Button>
      }
    >
      <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
        <Typography fontWeight={800} fontSize={13}>
          {branch.reason === 'conflict' ? '离线改动出现字段冲突' : '离线改动未合入（审核锁定保留）'}
        </Typography>
        <Typography fontSize={12} color="text.secondary">
          留下 1 个待处理分支（{branch.conflicts.length} 处冲突{branch.preserved.length ? `、${branch.preserved.length} 处保留` : ''}），可指派责任人重试或放弃。
        </Typography>
      </Stack>
    </Alert>
  )
}
