import React, { useState, useEffect } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Button, IconButton, Menu as MuiMenu, MenuItem, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Card, Divider, Alert, useMediaQuery,
  useTheme
} from '@mui/material';
import {
  BookOpen, Plus, Trash2, Star, Folder, Search, Menu as MenuIcon, X, MoreVertical, Download
} from 'lucide-react';
import { Notebook, loadNotebooks as loadCloudNotebooks, createDefaultNotebook, deleteNotebook, saveNotebook, createFolder, getFolders, deleteFolder } from '../storage/cloud';
import { AppLogo } from './AppLogo';
import { useThemeMode } from '../ThemeContext';
import { ProfileDropdown } from './Auth/ProfileDropdown';

interface LibraryViewProps {
  onOpenNotebook: (notebookId: string) => void;
  onSignOut: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onOpenNotebook, onSignOut }) => {
  const theme = useTheme();
  const { mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('Untitled Notebook');
  const [coverColor, setCoverColor] = useState('#1976d2');
  const [error, setError] = useState<string | null>(null);
  // Per-notebook menu (the ⋮ icon replacing the old delete button on each tile)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuNotebookId, setMenuNotebookId] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const loadNotebooks = async () => {
    try {
      const list = await loadCloudNotebooks();
      setNotebooks(list);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load notebooks');
    }
  };

  useEffect(() => {
    loadNotebooks();
  }, []);

  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  const handleCreateNotebook = async () => {
    const nb = await createDefaultNotebook(newTitle);
    nb.coverColor = coverColor;
    await saveNotebook(nb);
    setNewDialogOpen(false);
    setNewTitle('Untitled Notebook');
    loadNotebooks();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this notebook?')) {
      await deleteNotebook(id);
      loadNotebooks();
    }
  };

  // Open the ⋮ menu for a given notebook tile
  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuNotebookId(id);
  };
  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuNotebookId(null);
  };

  // Export: download this notebook as a JSON file to the local machine.
  // The shape matches what an import would expect to read back.
  const handleExport = (id: string) => {
    handleMenuClose();
    const nb = notebooks.find((n) => n.id === id);
    if (!nb) {
      setImportNotice('Notebook not found.');
      return;
    }
    try {
      const payload = JSON.stringify({
        id: nb.id,
        title: nb.title,
        coverColor: nb.coverColor,
        coverStyle: nb.coverStyle,
        createdAt: nb.createdAt,
        updatedAt: nb.updatedAt,
        pages: nb.pages,
        aiChat: nb.aiChat ?? [],
      });
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nb.title.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() || 'notebook'}.nohomework.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setImportNotice('Notebook exported.');
    } catch (err: any) {
      setImportNotice(err.message || 'Export failed');
    }
  };

  // Favourite / folder actions are not wired up yet — surface a notice so the
  // UI is ready for the dedicated screens when they land.
  const handleFavourite = () => {
    handleMenuClose();
    setImportNotice('Favorites screen coming soon.');
  };
  const handleAddToFolder = () => {
    handleMenuClose();
    setImportNotice('Folders screen coming soon.');
  };

  const filteredNotebooks = notebooks.filter(nb =>
    nb.title.toLowerCase().includes(searchQuery.toLowerCase())
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
          <ListItemButton selected sx={{
            borderRadius: 2,
            bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff',
            color: mode === 'dark' ? '#60a5fa' : '#1d4ed8',
            '&.Mui-selected': {
              bgcolor: mode === 'dark' ? 'rgba(37, 99, 235, 0.35)' : '#eff6ff',
            }
          }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><BookOpen size={20} /></ListItemIcon>
            <ListItemText primary="Documents" primaryTypographyProps={{ fontWeight: 600 }} />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton sx={{ borderRadius: 2, color: 'text.secondary' }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><Star size={20} /></ListItemIcon>
            <ListItemText primary="Favorites" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => navigate('/Folders')}
            sx={{ borderRadius: 2, color: 'text.secondary' }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><Folder size={20} /></ListItemIcon>
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
          New Notebook
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
            <Button size="small" onClick={loadNotebooks}>Retry</Button>
          }>
            {error}
          </Alert>
        )}
        {importNotice && (
          <Alert severity="info" sx={{ mb: 2 }} onClose={() => setImportNotice(null)}>
            {importNotice}
          </Alert>
        )}
        <Box sx={{ mb: 4 }}>
          {/* Desktop: single row — title left, search bar middle, profile icon right.
              Mobile/tablet: two rows — title+profile on top, full-width search below. */}
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
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: '24px', md: '34px' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Documents</Typography>
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
                  placeholder="Search notebooks..."
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
                  placeholder="Search notebooks..."
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

        {/* Notebook Grid */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(auto-fill, minmax(180px, 1fr))',
            md: 'repeat(auto-fill, minmax(220px, 1fr))'
          },
          gap: { xs: 2, md: 3 }
        }}>
          {filteredNotebooks.map((nb) => (
            <Card
              key={nb.id}
              sx={{
                borderRadius: 3,
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                height: { xs: 240, md: 280 },
                bgcolor: nb.coverColor,
                color: '#fff',
                position: 'relative'
              }}
              onClick={() => onOpenNotebook(nb.id)}
            >
              <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ opacity: 0.8, textTransform: 'uppercase', fontSize: '10px', letterSpacing: 1 }}>
                    Notebook
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, mt: 1, lineHeight: 1.2, wordBreak: 'break-word', fontSize: { xs: '16px', md: '20px' } }}>
                    {nb.title}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, mt: 'auto' }}>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>
                    {nb.pages.length} pages
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    {nb.created_date ?? new Date(nb.createdAt).toLocaleDateString()}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, nb.id)}
                    aria-label="Notebook options"
                    aria-controls={menuNotebookId === nb.id ? 'notebook-menu' : undefined}
                    aria-expanded={menuNotebookId === nb.id}
                    sx={{ color: '#fff', opacity: 0.7, '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.2)' } }}
                  >
                    <MoreVertical size={16} />
                  </IconButton>
                </Box>
              </Box>
            </Card>
          ))}
        </Box>

        {/* Per-notebook menu (⋮) — replaces the old per-tile delete button */}
        <MuiMenu
          id="notebook-menu"
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          MenuListProps={{
            'aria-labelledby': 'notebook-menu-label',
            onClick: (e) => e.stopPropagation(),
          }}
          PaperProps={{ sx: { borderRadius: 2, mt: 1, minWidth: 180 } }}
        >
          <MenuItem onClick={() => menuNotebookId && handleExport(menuNotebookId)}>
            <Box sx={{ mr: 1, color: 'text.secondary' }}><Download size={18} /></Box>
            Export
          </MenuItem>
          <MenuItem onClick={handleFavourite}>
            <Box sx={{ mr: 1, color: 'text.secondary' }}><Star size={18} /></Box>
            Mark as favourite
          </MenuItem>
          <MenuItem onClick={handleAddToFolder}>
            <Box sx={{ mr: 1, color: 'text.secondary' }}><Folder size={18} /></Box>
            Add to a folder
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleMenuClose();
              if (menuNotebookId) handleDelete(menuNotebookId);
            }}
            sx={{ color: 'error.main' }}
          >
            <Box sx={{ mr: 1 }}><Trash2 size={18} /></Box>
            Delete
          </MenuItem>
        </MuiMenu>
      </Box>

      {/* New Notebook Dialog */}
      <Dialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        fullWidth={isMobile}
        PaperProps={{ sx: { borderRadius: 3, p: 1, width: isMobile ? '100%' : 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Create New Notebook</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Notebook Title"
            fullWidth
            variant="outlined"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            sx={{ mt: 2, mb: 3 }}
          />
          <Typography variant="subtitle2" sx={{ mb: 1, color: '#64748b' }}>Cover Color</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {['#1976d2', '#2e7d32', '#d32f2f', '#ed6c02', '#9c27b0', '#0288d1'].map((color) => (
              <Box
                key={color}
                onClick={() => setCoverColor(color)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: color,
                  cursor: 'pointer',
                  border: coverColor === color ? '3px solid #0f172a' : '2px solid transparent',
                  transition: 'transform 0.1s',
                  '&:hover': { transform: 'scale(1.1)' }
                }}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setNewDialogOpen(false)} sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleCreateNotebook} variant="contained" sx={{ textTransform: 'none', borderRadius: 2 }}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
