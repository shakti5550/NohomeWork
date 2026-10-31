import React from 'react';
import {
  Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Button, IconButton
} from '@mui/material';
import {
  BookOpen, Star, Folder, Bookmark as BookmarkIcon, X, Plus, Trash2
} from 'lucide-react';
import { AppLogo } from './AppLogo';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThemeMode } from '../ThemeContext';

/**
 * A custom nav item for views that need extra links not covered by the
 * standard Documents / Favorites / Folders / Bookmarks set.
 */
export interface ExtraNavItem {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  /** Set true to render as a clickable link; omitted onClick renders it as a static label. */
  to?: string;
}

/**
 * Shared application sidebar, used by the Documents, Favorites, Folders,
 * Folder detail and Bookmarks screens. It renders the same navigation in
 * every view — Documents, Favorites, Folders, Bookmarks — with the active
 * route highlighted, plus a configurable bottom action button (e.g.
 * "New Notebook" or "New Folder").
 *
 * Each view keeps its own mobile Drawer wrapper around this component so
 * the open/closed state stays view-local.
 */
interface AppSidebarProps {
  isMobile: boolean;
  onClose: () => void;
  newButtonLabel: string;
  onNewClick: () => void;
  /** Additional nav items injected below the standard set. */
  extraNavItems?: ExtraNavItem[];
  /** Hide the bottom action button entirely (used by screens like Trash that have no "create" action). */
  hideNewButton?: boolean;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  isMobile,
  onClose,
  newButtonLabel,
  onNewClick,
  extraNavItems,
  hideNewButton
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useThemeMode();

  const navItems: { label: string; icon: React.ReactNode; to: string; active: (p: string) => boolean }[] = [
    { label: 'Documents', icon: <BookOpen size={20} />, to: '/Home', active: (p) => p === '/Home' },
    { label: 'Favorites', icon: <Star size={20} />, to: '/Favorites', active: (p) => p === '/Favorites' },
    { label: 'Folders', icon: <Folder size={20} />, to: '/Folders', active: (p) => p.startsWith('/Folders') },
    { label: 'Bookmarks', icon: <BookmarkIcon size={20} />, to: '/Bookmarks', active: (p) => p === '/Bookmarks' },
    { label: 'Trash', icon: <Trash2 size={20} />, to: '/Trash', active: (p) => p === '/Trash' },
  ];

  return (
    <Box sx={{
      width: 260,
      bgcolor: 'background.paper',
      color: 'text.primary',
      height: isMobile ? '100%' : '100vh',
      p: 2,
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      borderRight: isMobile ? 'none' : '1px solid',
      borderColor: 'divider'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, px: 1 }}>
        <AppLogo size={32} />
        {isMobile && (
          <IconButton onClick={onClose} size="small" color="inherit">
            <X size={20} />
          </IconButton>
        )}
      </Box>

      <List sx={{ flexGrow: 1, gap: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {navItems.map((item) => {
          const selected = item.active(location.pathname);
          return (
            <ListItem key={item.to} disablePadding>
              <ListItemButton
                selected={selected}
                onClick={() => navigate(item.to)}
                sx={{
                  borderRadius: 2,
                  bgcolor: selected
                    ? (mode === 'dark' ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff')
                    : 'transparent',
                  color: selected
                    ? (mode === 'dark' ? '#60a5fa' : '#1d4ed8')
                    : 'text.secondary',
                  '&.Mui-selected': {
                    bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.35)' : '#eff6ff',
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
              </ListItemButton>
            </ListItem>
          );
        })}
        {extraNavItems?.map((item, i) => (
          <ListItem key={i} disablePadding>
            <ListItemButton
              onClick={item.onClick}
              sx={{ borderRadius: 2, color: 'text.secondary' }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {!hideNewButton && (
        <Box sx={{ pt: 2, pb: 1 }}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<Plus size={18} />}
            onClick={onNewClick}
            sx={{ py: 1.2, borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}
          >
            {newButtonLabel}
          </Button>
        </Box>
      )}
    </Box>
  );
};