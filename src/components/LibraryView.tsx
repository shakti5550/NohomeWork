import React, { useState, useEffect } from 'react';
import {
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Card, Divider, useMediaQuery, useTheme, Switch
} from '@mui/material';
import {
  BookOpen, Plus, Trash2, Star, Folder, Search, LogOut, Menu, X, Sun, Moon
} from 'lucide-react';
import { Notebook, getAllNotebooks, createDefaultNotebook, deleteNotebook, saveNotebook } from '../storage/db';
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

  const loadNotebooks = async () => {
    const list = await getAllNotebooks();
    if (list.length === 0) {
      const defaultNb = await createDefaultNotebook('Welcome to NohomeWork');
      setNotebooks([defaultNb]);
    } else {
      setNotebooks(list);
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this notebook?')) {
      await deleteNotebook(id);
      loadNotebooks();
    }
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
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={toggleTheme} color="inherit">
            {mode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </IconButton>
          {isMobile && (
            <IconButton onClick={() => setIsSidebarOpen(false)} size="small" color="inherit">
              <X size={20} />
            </IconButton>
          )}
        </Box>
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
          <ListItemButton sx={{ borderRadius: 2, color: 'text.secondary' }}>
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
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', sm: 'center' }, mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isMobile && (
              <IconButton onClick={() => setIsSidebarOpen(true)} sx={{ mr: 1 }} color="inherit">
                <Menu size={24} />
              </IconButton>
            )}
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: '24px', md: '34px' } }}>Documents</Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            {/* Profile Dropdown */}
            <ProfileDropdown onSignOut={onSignOut} />

            {/* Search Bar */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              bgcolor: 'background.paper',
              px: 2,
              py: 0.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              width: { xs: '100%', sm: 300 }
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

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>
                    {nb.pages.length} pages
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDelete(e, nb.id)}
                    sx={{ color: '#fff', opacity: 0.7, '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.2)' } }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </Box>
              </Box>
            </Card>
          ))}
        </Box>
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
