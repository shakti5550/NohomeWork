import React, { useState, useEffect } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Button, IconButton, Menu as MuiMenu, MenuItem, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Card, Alert, useMediaQuery, useTheme,
  Skeleton, CircularProgress
} from '@mui/material';
import {
  BookOpen, Plus, Trash2, Folder as FolderIcon, Search, X, Download, ArrowLeft, Star
} from 'lucide-react';
import {
  Notebook,
  deleteNotebook,
  createFolder,
  getFolders,
  addNotebookToFolder,
  removeNotebookFromFolder,
  getNotebooksInFolder,
  getFolder,
  setFavourite,
} from '../storage/cloud';
import { AppLogo } from './AppLogo';
import { NotebookTile } from './NotebookTile';
import { useThemeMode } from '../ThemeContext';
import { ProfileDropdown } from './Auth/ProfileDropdown';
import { useNavigate } from 'react-router-dom';
import { Toast } from './Toast';

interface FolderDetailProps {
  folderId: string;
  onSignOut: () => void;
}

export const FolderDetail: React.FC<FolderDetailProps> = ({ folderId, onSignOut }) => {
  const theme = useTheme();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [folder, setFolder] = useState<any>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuNotebookId, setMenuNotebookId] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [addFolderDialogOpen, setAddFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [foldersList, setFoldersList] = useState<any[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  // Fetch folder and its notebooks
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getFolder(folderId), getNotebooksInFolder(folderId)])
      .then(([f, nbs]) => {
        if (cancelled) return;
        setFolder(f ?? null);
        setNotebooks(nbs ?? []);
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load folder');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [folderId]);

  // ─── Notebook menu ────────────────────────────────────────────────────────
  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuNotebookId(id);
  };
  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuNotebookId(null);
  };

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

  const handleDelete = async (id: string) => {
    handleMenuClose();
    if (confirm('Are you sure you want to delete this notebook?')) {
      try {
        await deleteNotebook(id);
        setNotebooks((prev) => prev.filter((n) => n.id !== id));
      } catch (err: any) {
        setImportNotice(err.message || 'Failed to delete notebook');
      }
    }
  };

  // ─── Add to folder ────────────────────────────────────────────────────────
  const handleAddToFolderOpen = async (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    handleMenuClose();
    setMenuNotebookId(id);
    setFoldersLoading(true);
    setAddFolderDialogOpen(true);
    try {
      const folders = await getFolders();
      setFoldersList(folders);
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to load folders');
    } finally {
      setFoldersLoading(false);
    }
  };

  const handleAddToFolderSelect = async (folderId: string) => {
    if (!menuNotebookId) return;
    try {
      await addNotebookToFolder(menuNotebookId, folderId);
      setAddFolderDialogOpen(false);
      setImportNotice('Notebook added to folder.');
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to add to folder');
    }
  };

  const handleRemoveFromFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (!menuNotebookId) return;
    try {
      await removeNotebookFromFolder(menuNotebookId, folderId);
      setImportNotice('Notebook removed from folder.');
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to remove from folder');
    }
  };

  const handleCreateNewFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const folder = await createFolder(newFolderName);
      setNewFolderDialogOpen(false);
      setNewFolderName('');
      // Clear the previous notebook selection — this dialog is opened via the
      // sidebar "New Folder" button, not through the add-to-folder flow.
      setMenuNotebookId(null);
      setImportNotice(`Folder "${folder.name}" created.`);
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to create folder');
    }
  };

  // ─── Favourite ──────────────────────────────────────────────────────────────
  // The notebook whose ⋮ menu is open — used to label the favourite action.
  const menuNotebook = notebooks.find((n) => n.id === menuNotebookId) ?? null;

  const handleFavourite = async () => {
    const nbId = menuNotebookId;
    handleMenuClose();
    if (!nbId) return;
    const next = !(menuNotebook?.favourite);
    try {
      await setFavourite(nbId, next);
      setNotebooks((prev) => prev.map((n) =>
        n.id === nbId ? { ...n, favourite: next } : n
      ));
      setImportNotice(next ? 'Added to favourites.' : 'Removed from favourites.');
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to update favourite');
    }
  };

  // ─── Sidebar ──────────────────────────────────────────────────────────────
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
      borderColor: 'divider',
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
          <ListItemButton
            onClick={() => navigate('/Folders')}
            sx={{ borderRadius: 2, color: 'text.secondary' }}
          >
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
            setNewFolderDialogOpen(true);
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
      {/* Sidebar */}
      {!isMobile && SidebarContent}

      <Drawer
        open={isMobile && isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: 260, height: '100%', bgcolor: 'background.paper' } }}
      >
        {SidebarContent}
      </Drawer>

      {/* Main content */}
      <Box sx={{ flex: 1, p: { xs: 2, md: 4 }, overflowY: 'auto' }}>
        {/* Top alert area */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => window.location.reload()}>Retry</Button>}>
            {error}
          </Alert>
        )}
        {importNotice && (
          <Toast message={importNotice} severity="info" onClose={() => setImportNotice(null)} />
        )}

        {/* Breadcrumb header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                onClick={() => navigate('/Folders')}
                sx={{ mr: 0.5 }}
                color="inherit"
                size={isMobile ? 'medium' : 'small'}
              >
                <ArrowLeft size={isMobile ? 24 : 18} />
              </IconButton>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {loading ? <Skeleton width={120} /> : `Folders > ${folder?.name ?? folderId}`}
              </Typography>
            </Box>

            {/* Mobile search — hidden on desktop (replaced by profile) */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'background.paper', px: 2, py: 0.5, borderRadius: 3, border: '1px solid', borderColor: 'divider', width: '100%' }}>
                <Search size={18} color="#94a3b8" />
                <input type="text" placeholder="Search notebooks..." style={{ border: 'none', outline: 'none', padding: '8px', width: '100%', fontSize: '14px', background: 'transparent', color: mode === 'dark' ? '#f8fafc' : '#0f172a' }} />
              </Box>
            </Box>

            {/* Profile dropdown (desktop) */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
              <ProfileDropdown onSignOut={onSignOut} mode={mode} toggleTheme={toggleTheme} />
            </Box>
          </Box>
        </Box>

        {/* Notebook tiles grid */}
        {loading ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(180px, 1fr))', md: 'repeat(auto-fill, minmax(220px, 1fr))' }, gap: { xs: 2, md: 3 } }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} sx={{ borderRadius: 3, height: { xs: 240, md: 280 }, bgcolor: 'action.disabled' }}>
                <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <Box>
                    <Skeleton width={60} height={16} sx={{ mb: 1 }} />
                    <Skeleton width="80%" height={24} />
                  </Box>
                  <Skeleton width={80} height={14} />
                </Box>
              </Card>
            ))}
          </Box>
        ) : notebooks.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, color: 'text.secondary' }}>
            <FolderIcon size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <Typography variant="h6" sx={{ fontWeight: 500 }}>This folder is empty</Typography>
            <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
              Go to Documents and add notebooks to this folder via the ⋮ menu
            </Typography>
          </Box>
        ) : (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(180px, 1fr))',
              md: 'repeat(auto-fill, minmax(220px, 1fr))'
            },
            gap: { xs: 2, md: 3 }
          }}>
            {notebooks.map((nb) => (
              <NotebookTile
                key={nb.id}
                nb={nb}
                onOpen={(id) => navigate('/Editor/' + id)}
                onMenuOpen={handleMenuOpen}
                menuActiveId={menuNotebookId}
              />
            ))}
          </Box>
        )}

        {/* Per-notebook menu */}
        <MuiMenu
          id="notebook-menu"
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          MenuListProps={{ 'aria-labelledby': 'notebook-menu-label', onClick: (e) => e.stopPropagation() }}
          PaperProps={{ sx: { borderRadius: 2, mt: 1, minWidth: 180 } }}
        >
          <MenuItem onClick={() => menuNotebookId && handleExport(menuNotebookId)}>
            <Box sx={{ mr: 1, color: 'text.secondary' }}><Download size={18} /></Box>
            Export
          </MenuItem>
          <MenuItem onClick={handleFavourite}>
            <Box sx={{ mr: 1, color: menuNotebook?.favourite ? 'warning.main' : 'text.secondary' }}>
              <Star size={18} fill={menuNotebook?.favourite ? 'currentColor' : 'none'} />
            </Box>
            {menuNotebook?.favourite ? 'Remove from favourites' : 'Mark as favourite'}
          </MenuItem>
          <MenuItem onClick={(e) => menuNotebookId && handleAddToFolderOpen(e, menuNotebookId)}>
            <Box sx={{ mr: 1, color: 'text.secondary' }}><FolderIcon size={18} /></Box>
            Add to a folder
          </MenuItem>
          <MenuItem
            onClick={(e) => {
              e.stopPropagation();
              if (!menuNotebookId) return;
              handleRemoveFromFolder(e, folderId);
              setNotebooks((prev) => prev.filter((n) => n.id !== menuNotebookId));
            }}
            sx={{ color: 'text.secondary' }}
          >
            <Box sx={{ mr: 1, color: 'text.secondary' }}><X size={18} /></Box>
            Remove from folder
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

      {/* Add to folder dialog */}
      <Dialog
        open={addFolderDialogOpen}
        onClose={() => setAddFolderDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3, p: 1, width: '100%', maxWidth: 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Add to a folder</DialogTitle>
        <DialogContent sx={{ py: 1 }}>
          {foldersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : foldersList.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No folders yet. Create one below.
            </Typography>
          ) : (
            <List dense>
              {foldersList.map((folderItem) => (
                <ListItemButton
                  key={folderItem.id}
                  onClick={() => handleAddToFolderSelect(folderItem.id)}
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                    <FolderIcon size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={folderItem.name}
                    primaryTypographyProps={{ fontSize: '14px' }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3, flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
            <Button
              onClick={() => {
                setAddFolderDialogOpen(false);
                setNewFolderDialogOpen(true);
              }}
              sx={{ color: '#64748b', textTransform: 'none', flex: 1 }}
            >
              + New Folder
            </Button>
            <Button onClick={() => setAddFolderDialogOpen(false)} sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Create new folder dialog */}
      <Dialog
        open={newFolderDialogOpen}
        onClose={() => setNewFolderDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3, p: 1, width: '100%', maxWidth: 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            variant="outlined"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            sx={{ mt: 2, mb: 3 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setNewFolderDialogOpen(false)} sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleCreateNewFolder} variant="contained" sx={{ textTransform: 'none', borderRadius: 2 }}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
