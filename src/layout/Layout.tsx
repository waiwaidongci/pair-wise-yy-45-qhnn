import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  AppBar,
  Badge,
  Box,
  Chip,
  Drawer,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Switch,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined'
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { openSyncCenter, setCurrentUser, setOffline, syncOutbox } from '../features/developmentSlice'
import SyncCenterDialog from '../components/SyncCenterDialog'

const nav = [
  { to: '/', label: '开发总览', icon: <DashboardOutlinedIcon /> },
  { to: '/styles', label: '款式档案', icon: <Inventory2OutlinedIcon /> },
  { to: '/review', label: '样品评审', icon: <CompareArrowsOutlinedIcon /> },
  { to: '/history', label: '修订历史', icon: <HistoryOutlinedIcon /> },
]

const IDENTITIES = [
  { name: '沈岚', role: '产品开发' },
  { name: '周研', role: '版师' },
  { name: '陈曼', role: '产品开发' },
  { name: '顾恺', role: '质检' },
]

export default function Layout() {
  const dispatch = useAppDispatch()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { currentUser, offline, outboxCount, branchCount } = useAppSelector((s) => ({
    currentUser: s.development.currentUser,
    offline: s.development.offline,
    outboxCount: s.development.outbox.filter((op) => op.status === '待同步').length,
    branchCount: s.development.branches.filter((b) => b.status === '待处理').length,
  }))

  const drawer = (
    <Box sx={{ width: 242, minHeight: '100%', bgcolor: '#262a2b', color: '#eef1ef', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.2, borderBottom: '1px solid rgba(255,255,255,.1)' }}>
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', border: '1px solid #74aaa0', borderRadius: 1 }}>
          <CheckroomIcon fontSize="small" />
        </Box>
        <Box>
          <Typography fontWeight={800} fontSize={14}>MORROW 开发台</Typography>
          <Typography color="#9aa6a3" fontSize={11}>2026 秋冬 · 女装</Typography>
        </Box>
      </Box>

      <Box sx={{ px: 1.5, py: 1.4, borderBottom: '1px solid rgba(255,255,255,.1)' }}>
        <Typography color="#8f9a98" fontSize={10} mb={0.6}>当前身份（提交人）</Typography>
        <Box component="select"
          value={currentUser.name}
          onChange={(e) => {
            const id = IDENTITIES.find((x) => x.name === e.target.value)
            if (id) dispatch(setCurrentUser(id))
          }}
          style={{
            width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.18)',
            background: '#333839', color: '#eef1ef', fontSize: 13,
          }}
        >
          {IDENTITIES.map((id) => (
            <option key={id.name} value={id.name}>{id.name} · {id.role}</option>
          ))}
        </Box>
      </Box>

      <List sx={{ px: 1.2, py: 2 }}>
        {nav.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileOpen(false)}
            sx={{
              color: '#cbd3d1',
              borderRadius: 1,
              mb: 0.4,
              '&.active': { color: '#fff', bgcolor: '#374a48', boxShadow: 'inset 3px 0 #6eb0a4' },
            }}
          >
            <Box sx={{ mr: 1.2, display: 'flex' }}>{item.icon}</Box>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13, fontWeight: 650 }} />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ mx: 1.5, mt: 'auto', p: 1.2, border: '1px solid rgba(255,255,255,.1)', borderRadius: 1.5 }}>
        <FormControlLabel
          sx={{ m: 0, gap: 0.6 }}
          control={
            <Switch
              size="small"
              checked={offline}
              onChange={(e) => dispatch(setOffline(e.target.checked))}
            />
          }
          label={
            <Stack direction="row" alignItems="center" spacing={0.5}>
              {offline ? <CloudOffOutlinedIcon sx={{ fontSize: 15, color: '#d98a5e' }} /> : <CloudDoneOutlinedIcon sx={{ fontSize: 15, color: '#74b79d' }} />}
              <Typography fontSize={11}>{offline ? '离线工作中' : '在线同步'}</Typography>
            </Stack>
          }
        />
        <Typography color="#8f9a98" fontSize={10} mt={0.4}>
          {offline ? '改动先入待同步队列，联网后合并' : '每次操作带基准版本，自动合并'}
        </Typography>
        <Stack direction="row" spacing={0.6} mt={1}>
          <Tooltip title="同步待提交改动">
            <IconButton size="small" sx={{ color: '#9fd4c7' }} onClick={() => dispatch(syncOutbox())}>
              <CloudSyncOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="待处理分支">
            <IconButton size="small" sx={{ color: branchCount ? '#e8a06e' : '#9fd4c7' }} onClick={() => dispatch(openSyncCenter())}>
              <Badge badgeContent={branchCount} color="warning" overlap="circular">
                <CompareArrowsOutlinedIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          {outboxCount > 0 && <Chip size="small" color="info" label={`待同步 ${outboxCount}`} />}
        </Stack>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="transparent" elevation={0} sx={{ display: { md: 'none' }, bgcolor: '#262a2b' }}>
        <Toolbar sx={{ minHeight: 52 }}>
          <IconButton color="inherit" onClick={() => setMobileOpen(true)}><MenuIcon /></IconButton>
          <Typography fontWeight={800} ml={1}>MORROW 开发台</Typography>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: 242 }, flexShrink: { md: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { xs: 'block', md: 'none' } }}>
          {drawer}
        </Drawer>
        <Drawer variant="permanent" open sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: 242, border: 0 } }}>
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ flex: 1, minWidth: 0, pt: { xs: '52px', md: 0 } }}>
        <Outlet />
      </Box>
      <SyncCenterDialog />
    </Box>
  )
}
