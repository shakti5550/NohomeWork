import React, { useState, useEffect } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, useMediaQuery, useTheme, Paper
} from '@mui/material';
import {
  BookOpen, Plus, Trash2, Folder as FolderIcon, Search, Menu as MenuIcon, X, Calendar
} from 'lucide-react';
import { Folder, getFolders, createFolder, deleteFolder } from '../storage/cloud';
import { AppLogo } from './AppLogo';
import { useThemeMode } from '../ThemeContext';
import { ProfileDropdown } from './Auth/ProfileDropdown';
import { useNavigate } from 'react-router-dom';
import { Toast } from './Toast';

interface FoldersViewProps {
  onSignOut: () => void;
}

export const FoldersView: React.FC<FoldersViewProps> = ({ onSignOut }) => {
  const theme = useTheme();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('Untitled Folder');
  const [error, setError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<{ message: string; severity?: 'info' | 'success' | 'warning' | 'error' } | null>(null);

  const loadFolders = async () => {
    try {
      const list = await getFolders();
      setFolders(list);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load folders');
    }
  };

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  const handleCreateFolder = async () => {
    try {
      await createFolder(newTitle);
      setNewDialogOpen(false);
      setNewTitle('Untitled Folder');
      loadFolders();
      setImportNotice({ message: 'Folder created successfully.', severity: 'success' });
    } catch (err: any) {
      setImportNotice({ message: err.message || 'Failed to create folder', severity: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this folder?')) {
      try {
        await deleteFolder(id);
        loadFolders();
        setImportNotice({ message: 'Folder deleted.', severity: 'success' });
      } catch (err: any) {
        setImportNotice({ message: err.message || 'Failed to delete folder', severity: 'error' });
      }
    }
  };

  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const SidebarContent = (
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
          <IconButton onClick={() => setIsSidebarOpen(false)} size="small" color="inherit">
            <X size={20} />
          </IconButton>
        )}
      </Box>

      <List sx={{ flexGrow: 1, gap: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => navigate('/Home')}
            sx={{ borderRadius: 2, color: 'text.secondary' }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><BookOpen size={20} /></ListItemIcon>
            <ListItemText primary="Documents" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton sx={{ borderRadius: 2, color: 'text.secondary' }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><Search size={20} /></ListItemIcon>
            <ListItemText primary="Favorites" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton selected sx={{
            borderRadius: 2,
            bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff',
            color: mode === 'dark' ? '#60a5fa' : '#1d4ed8',
            '&.Mui-selected': {
              bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.35)' : '#eff6ff',
            }
          }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><FolderIcon size={20} /></ListItemIcon>
            <ListItemText primary="Folders" />
          </ListItemButton>
        </ListItem>
      </List>

      <Box sx={{ pt: 2, pb: 1 }}>
        <Button
          variant="contained"
          fullWidth
          startIcon={<Plus size={18} />}
          onClick={() => {
            setNewDialogOpen(true);
            if (isMobile) setIsSidebarOpen(false);
          }}
          sx={{ py: 1.2, borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}
        >
          New Folder
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden' }}>
      {/* Sidebar - Desktop */}
      {!isMobile && SidebarContent}

      {/* Sidebar - Mobile Drawer */}
      <Drawer
        open={isMobile && isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: 260, height: '100%', bgcolor: 'background.paper' } }}
      >
        {SidebarContent}
      </Drawer>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, p: { xs: 2, md: 4 }, overflowY: 'auto' }}>
        {/* Top Header */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} action={
            <Button size="small" onClick={loadFolders}>Retry</Button>
          }>
            {error}
          </Alert>
        )}
        {importNotice && (
          <Toast message={importNotice.message} severity={importNotice.severity || 'info'} onClose={() => setImportNotice(null)} />
        )}
        <Box sx={{ mb: 4 }}>
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'center' },
            justifyContent: 'space-between',
            gap: { xs: 2, md: 0 }
          }}>
            {/* Left group: Title + Profile (mobile: same row, desktop: title only) */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              minWidth: 0,
              flex: { xs: 1, md: 'auto' }
            }}>
              {isMobile && (
                <IconButton onClick={() => setIsSidebarOpen(true)} sx={{ mr: 1 }} color="inherit">
                  <MenuIcon size={24} />
                </IconButton>
              )}
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: '24px', md: '34px' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Folders</Typography>
              {/* Profile icon: mobile-only, right-aligned with title */}
              <Box sx={{
                ml: 'auto',
                display: { xs: 'flex', md: 'none' }
              }}>
                <ProfileDropdown onSignOut={onSignOut} mode={mode} toggleTheme={toggleTheme} />
              </Box>
            </Box>

            {/* Right group: Search + Profile (mobile: hidden, desktop: visible) */}
            <Box sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 1.5,
              width: 'auto'
            }}>
              {/* Search bar */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'background.paper',
                px: 2,
                py: 0.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                width: 300
              }}>
                <Search size={18} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    padding: '8px',
                    width: '100%',
                    fontSize: '14px',
                    background: 'transparent',
                    color: mode === 'dark' ? '#f8fafc' : '#0f172a'
                  }}
                />
              </Box>

              {/* Profile icon - desktop only */}
              <ProfileDropdown onSignOut={onSignOut} mode={mode} toggleTheme={toggleTheme} />
            </Box>

            {/* Mobile: full-width search bar below title */}
            <Box sx={{
              display: { xs: 'flex', md: 'none' },
              width: '100%'
            }}>
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'background.paper',
                px: 2,
                py: 0.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                width: '100%'
              }}>
                <Search size={18} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    padding: '8px',
                    width: '100%',
                    fontSize: '14px',
                    background: 'transparent',
                    color: mode === 'dark' ? '#f8fafc' : '#0f172a'
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Folders List View */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filteredFolders.length === 0 ? (
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              color: 'text.secondary'
            }}>
              <FolderIcon size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
              <Typography variant="h6" sx={{ fontWeight: 500 }}>No folders yet</Typography>
              <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
                Click "New Folder" to create your first folder
              </Typography>
            </Box>
          ) : (
            filteredFolders.map((folder) => (
              <Paper
                key={folder.id}
                sx={{
                  borderRadius: 2,
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  width: '100%',
                  border: '1px solid transparent',
                  transition: 'background-color 0.2s, border-color 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.05)',
                    borderColor: mode === 'dark' ? 'rgba(37, 99, 235, 0.3)' : 'rgba(37, 99, 235, 0.3)',
                  }
                }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={() => navigate('/Folders/' + folder.id)}
                  aria-label={`Open folder ${folder.name}`}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    font: 'inherit',
                    textAlign: 'left',
                    padding: 0,
                    borderRadius: 1,
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: mode === 'dark' ? '#60a5fa' : '#1d4ed8',
                      outlineOffset: 2,
                    }
                  }}
                >
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: mode === 'dark' ? '#60a5fa' : '#1d4ed8',
                    flexShrink: 0
                  }}>
                    <FolderIcon size={20} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" sx={{
                      fontWeight: 600,
                      fontSize: '16px',
                      wordBreak: 'break-word'
                    }}>
                      {folder.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Calendar size={12} />
                      {folder.created_date ?? new Date(folder.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(folder.id);
                  }}
                  sx={{
                    color: 'text.secondary',
                    flexShrink: 0,
                    '&:hover': {
                      bgcolor: 'error.light',
                      color: 'error.contrastText'
                    }
                  }}
                >
                  <Trash2 size={18} />
                </IconButton>
              </Paper>
            ))
          )}
        </Box>
      </Box>

      {/* New Folder Dialog */}
      <Dialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        fullWidth={isMobile}
        PaperProps={{ sx: { borderRadius: 3, p: 1, width: isMobile ? '100%' : 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            variant="outlined"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            sx={{ mt: 2, mb: 3 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setNewDialogOpen(false)} sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained" sx={{ textTransform: 'none', borderRadius: 2 }}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
