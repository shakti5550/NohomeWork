import React, { useState, useEffect } from 'react';
import {
  Box, Drawer, Typography, Skeleton, Alert, Button, IconButton, Paper, useTheme, useMediaQuery
} from '@mui/material';
import {
  Folder as FolderIcon, BookOpen, Trash2, RotateCcw, Search as SearchIcon,
  Menu as MenuIcon, Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '../ThemeContext';
import { ProfileDropdown } from './Auth/ProfileDropdown';
import { getTrashFolders, getTrashNotebooks, purgeTrash, restoreFolder, restoreNotebook, hardDeleteFolder, hardDeleteNotebook, Folder, Notebook } from '../storage/cloud';
import { AppSidebar } from './AppSidebar';
import { Toast } from './Toast';

interface TrashViewProps {
  onSignOut: () => void;
}

const emptyState = (icon: React.ReactNode, title: string, subtitle: string) => (
  <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
    <Box sx={{ fontSize: 32, marginBottom: 1, opacity: 0.3 }}>{icon}</Box>
    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    <Typography variant="body2">{subtitle}</Typography>
  </Box>
);

export const TrashView: React.FC<TrashViewProps> = ({ onSignOut }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [folderSearch, setFolderSearch] = useState('');
  const [nbSearch, setNbSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, n] = await Promise.all([getTrashFolders(), getTrashNotebooks()]);
      setFolders(f);
      setNotebooks(n);
    } catch (err: any) {
      setError(err.message || 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const handleRestoreFolder = async (id: string) => {
    try {
      await restoreFolder(id);
      setToastMsg('Folder restored.');
      loadTrash();
    } catch (err: any) {
      setToastMsg(err.message || 'Failed to restore folder');
    }
  };

  const handleRestoreNotebook = async (id: string) => {
    try {
      await restoreNotebook(id);
      setToastMsg('Notebook restored.');
      loadTrash();
    } catch (err: any) {
      setToastMsg(err.message || 'Failed to restore notebook');
    }
  };

  const handlePermanentDeleteFolder = async (id: string) => {
    if (!confirm('Permanently delete this folder? This cannot be undone.')) return;
    try {
      await hardDeleteFolder(id);
      setToastMsg('Folder permanently deleted.');
      loadTrash();
    } catch (err: any) {
      setToastMsg(err.message || 'Failed to delete folder');
    }
  };

  const handlePermanentDeleteNotebook = async (id: string) => {
    if (!confirm('Permanently delete this notebook and all its pages? This cannot be undone.')) return;
    try {
      await hardDeleteNotebook(id);
      setToastMsg('Notebook permanently deleted.');
      loadTrash();
    } catch (err: any) {
      setToastMsg(err.message || 'Failed to delete notebook');
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirm('Empty Trash? All items will be permanently deleted. This cannot be undone.')) return;
    try {
      await purgeTrash(0);
      setToastMsg('Trash emptied.');
      loadTrash();
    } catch (err: any) {
      setToastMsg(err.message || 'Failed to empty trash');
    }
  };

  const filteredFolders = folders.filter(f =>
    f.name.toLowerCase().includes(folderSearch.toLowerCase())
  );

  const filteredNotebooks = notebooks.filter(n =>
    n.title.toLowerCase().includes(nbSearch.toLowerCase())
  );

  const SidebarContent = (
    <AppSidebar
      isMobile={isMobile}
      onClose={() => setIsSidebarOpen(false)}
      newButtonLabel="Go to Documents"
      onNewClick={() => navigate('/Home')}
      hideNewButton
    />
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden' }}>
      {!isMobile && SidebarContent}

      <Drawer
        open={isMobile && isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: 260, height: '100%', bgcolor: 'background.paper' } }}
      >
        {SidebarContent}
      </Drawer>

      <Box sx={{ flex: 1, p: { xs: 2, md: 4 }, overflowY: 'auto' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={loadTrash}>Retry</Button>}>
            {error}
          </Alert>
        )}
        {toastMsg && <Toast message={toastMsg} severity="info" onClose={() => setToastMsg(null)} />}

        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2
          }}>
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
              <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '24px', md: '34px' } }}>
                Trash
              </Typography>
            </Box>

            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              ml: 'auto'
            }}>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={handleEmptyTrash}
                disabled={loading || (folders.length === 0 && notebooks.length === 0)}
                startIcon={<Trash2 size={16} />}
              >
                Empty Trash
              </Button>
              <ProfileDropdown onSignOut={onSignOut} mode={mode} toggleTheme={toggleTheme} />
            </Box>
          </Box>
        </Box>

        {/* Content - two pane layout */}
        {loading ? (
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="rounded" height={40} sx={{ mb: 2 }} />
              {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={60} sx={{ mb: 1 }} />)}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="rounded" height={40} sx={{ mb: 2 }} />
              {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={60} sx={{ mb: 1 }} />)}
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
            {/* Left: Folders */}
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                bgcolor: 'background.paper',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                p: 2,
                maxHeight: 'calc(100vh - 160px)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Folders ({filteredFolders.length})
                </Typography>
                <FolderIcon size={18} color="#94a3b8" />
              </Box>

              {/* Folder search */}
              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'background.default', px: 2, py: 0.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }}>
                <SearchIcon size={16} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search folders..."
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  style={{ border: 'none', outline: 'none', padding: '6px 8px', width: '100%', fontSize: '13px', background: 'transparent', color: mode === 'dark' ? '#f8fafc' : '#0f172a' }}
                />
              </Box>

              <Box sx={{ overflowY: 'auto', flex: 1 }}>
                {filteredFolders.length === 0 ? (
                  emptyState(<FolderIcon size={32} />, 'No folders in Trash', 'Deleted folders appear here.')
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {filteredFolders.map(folder => (
                      <Paper
                        key={folder.id}
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                          <Box sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            bgcolor: mode === 'dark' ? 'rgba(37,99,235,0.2)' : '#eff6ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: mode === 'dark' ? '#60a5fa' : '#1d4ed8',
                            flexShrink: 0
                          }}>
                            <FolderIcon size={18} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {folder.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Calendar size={12} />
                              Deleted {folder.deletedAt ? new Date(folder.deletedAt).toLocaleDateString() : 'unknown'}
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            fullWidth
                            startIcon={<RotateCcw size={14} />}
                            onClick={() => handleRestoreFolder(folder.id)}
                            sx={{ textTransform: 'none', fontSize: '12px' }}
                          >
                            Restore
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            fullWidth
                            color="error"
                            startIcon={<Trash2 size={14} />}
                            onClick={() => handlePermanentDeleteFolder(folder.id)}
                            sx={{ textTransform: 'none', fontSize: '12px' }}
                          >
                            Delete
                          </Button>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                )}
              </Box>
            </Paper>

            {/* Right: Notebooks */}
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                bgcolor: 'background.paper',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                p: 2,
                maxHeight: 'calc(100vh - 160px)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Notebooks ({filteredNotebooks.length})
                </Typography>
                <BookOpen size={18} color="#94a3b8" />
              </Box>

              {/* Notebook search */}
              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'background.default', px: 2, py: 0.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }}>
                <SearchIcon size={16} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search notebooks..."
                  value={nbSearch}
                  onChange={(e) => setNbSearch(e.target.value)}
                  style={{ border: 'none', outline: 'none', padding: '6px 8px', width: '100%', fontSize: '13px', background: 'transparent', color: mode === 'dark' ? '#f8fafc' : '#0f172a' }}
                />
              </Box>

              <Box sx={{ overflowY: 'auto', flex: 1 }}>
                {filteredNotebooks.length === 0 ? (
                  emptyState(<BookOpen size={32} />, 'No notebooks in Trash', 'Deleted notebooks appear here.')
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {filteredNotebooks.map(nb => (
                      <Paper
                        key={nb.id}
                        elevation={0}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                          <Box sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            bgcolor: nb.coverColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            flexShrink: 0,
                            fontSize: '12px',
                            fontWeight: 700
                          }}>
                            {nb.title[0]?.toUpperCase()}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {nb.title}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Calendar size={12} />
                              Deleted {nb.deletedAt ? new Date(nb.deletedAt).toLocaleDateString() : 'unknown'}
                              <span style={{ marginLeft: 8, color: 'text.secondary' }}>• {nb.pages.length} pages</span>
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            fullWidth
                            startIcon={<RotateCcw size={14} />}
                            onClick={() => handleRestoreNotebook(nb.id)}
                            sx={{ textTransform: 'none', fontSize: '12px' }}
                          >
                            Restore
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            fullWidth
                            color="error"
                            startIcon={<Trash2 size={14} />}
                            onClick={() => handlePermanentDeleteNotebook(nb.id)}
                            sx={{ textTransform: 'none', fontSize: '12px' }}
                          >
                            Delete
                          </Button>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                )}
              </Box>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
};
