import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Drawer, Menu as MuiMenu, MenuItem, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, useMediaQuery,
  useTheme, Typography, IconButton, Button, Select, FormControl, InputLabel, OutlinedInput, CircularProgress
} from '@mui/material';
import {
  Trash2, Search, Menu as MenuIcon, Download, Plus, Star, Folder,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { Notebook, loadNotebooks as loadCloudNotebooks, createDefaultNotebook, deleteNotebook, saveNotebook, createFolder, getFolders, addNotebookToFolder, setFavourite } from '../storage/cloud';
import { useThemeMode } from '../ThemeContext';
import { ProfileDropdown } from './Auth/ProfileDropdown';
import { useNavigate, useLocation } from 'react-router-dom';
import { NotebookTile } from './NotebookTile';
import { Toast } from './Toast';
import { AppSidebar } from './AppSidebar';

// ─── Date grouping helpers ─────────────────────────────────────────────────
// Notebooks are grouped by the calendar day they were created on, newest
// first. Each group renders as a collapsible section: a full-format date
// header (e.g. "Monday, 26th October 2026") with a chevron at the far right,
// followed by the notebook tiles created on that day.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Ordinal suffix for a day-of-month: 1→st, 2→nd, 3→rd, 4..20→th, 21→st, … */
function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/** Returns the calendar-day key (YYYY-MM-DD) for a notebook. */
function notebookDayKey(nb: Notebook): string {
  if (nb.created_date) return nb.created_date;
  return new Date(nb.createdAt).toISOString().slice(0, 10);
}

/** Renders a YYYY-MM-DD key as "Weekday, Dth Month YYYY". */
function formatDateFull(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const weekday = WEEKDAYS[date.getDay()];
  const month = MONTHS[date.getMonth()];
  return `${weekday}, ${d}${ordinal(d)} ${month} ${y}`;
}

interface DateGroup {
  key: string;
  label: string;
  notebooks: Notebook[];
}

/** Groups notebooks by creation day, newest date first. */
function groupByDate(notebooks: Notebook[]): DateGroup[] {
  const map = new Map<string, Notebook[]>();
  for (const nb of notebooks) {
    const key = notebookDayKey(nb);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(nb);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([key, notebooks]) => ({ key, label: formatDateFull(key), notebooks }));
}

interface LibraryViewProps {
  onOpenNotebook: (notebookId: string, returnTo?: string) => void;
  onSignOut: () => void;
  /** Route the editor should return to on Back; defaults to /Home. */
  returnTo?: string;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onOpenNotebook, onSignOut, returnTo }) => {
  const navigate = useNavigate();
  const location = useLocation();
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
  // Add-to-folder dialog
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);
  const [customFolderName, setCustomFolderName] = useState('');
  const [foldersList, setFoldersList] = useState<any[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [pendingFolderId, setPendingFolderId] = useState<string | null>(null);
  // Retains the notebook ID across renders so handlers work even after
  // handleMenuClose clears menuNotebookId. Also holds a freshly-created
  // folder id for retry on add-failure.
  const [pendingNotebookId, setPendingNotebookId] = useState<string | null>(null);
  // Which date-group sections are expanded. By default only the newest
  // group (today, or the closest earlier date if nothing was created today)
  // is expanded; the rest start collapsed. Seeded once notebooks load.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const seededRef = useRef(false);

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

  // Seed expanded state once notebooks load: expand the newest date group
  // (today, or the closest earlier date if nothing was created today).
  // Seeded only on first load so user toggles are never overridden.
  useEffect(() => {
    if (seededRef.current || notebooks.length === 0) return;
    const groups = groupByDate(notebooks);
    if (groups.length === 0) return;
    seededRef.current = true;
    setExpandedDays(new Set([groups[0].key]));
  }, [notebooks]);

  const handleCreateNotebook = async () => {
    const nb = await createDefaultNotebook(newTitle);
    nb.coverColor = coverColor;
    await saveNotebook(nb);
    setNewDialogOpen(false);
    setNewTitle('Untitled Notebook');
    // The new notebook may land in a date group the user has not expanded
    // yet (e.g. today, when the seeded group was an older date). Add its
    // day key to expandedDays so it's visible, preserving existing toggles.
    setExpandedDays((prev) => new Set(prev).add(notebookDayKey(nb)));
    loadNotebooks();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this notebook?')) {
      try {
        await deleteNotebook(id);
        loadNotebooks();
        setImportNotice('Notebook moved to Trash.');
      } catch (err: any) {
        setImportNotice(err.message || 'Failed to delete notebook');
      }
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

  // Toggle the favourite flag on the notebook whose ⋮ menu is open.
  // Capture the id first — handleMenuClose() below clears menuNotebookId.
  const handleFavourite = async () => {
    const nbId = menuNotebookId;
    handleMenuClose();
    if (!nbId) return;
    const nb = notebooks.find((n) => n.id === nbId);
    const next = !(nb?.favourite);
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
  const handleAddToFolder = async () => {
    // Capture before handleMenuClose clears menuNotebookId
    const nbId = menuNotebookId;
    handleMenuClose();
    if (!nbId) return;
    setPendingNotebookId(nbId);
    setFoldersLoading(true);
    setAddFolderOpen(true);
    setSelectedFolderId('');
    setIsCustom(false);
    setCustomFolderName('');
    setPendingFolderId(null);
    try {
      const list = await getFolders();
      setFoldersList(list);
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to load folders');
    } finally {
      setFoldersLoading(false);
    }
  };

  // Only updates selection — does not perform the write
  const handleFolderSelect = (value: string) => {
    setSelectedFolderId(value);
    // Clear stale retry state regardless of which option was chosen.
    // If the user picks an existing folder, it's already in foldersList.
    // If they pick custom, a fresh folder will be created.
    setPendingFolderId(null);
    if (value === 'custom') {
      setIsCustom(true);
      return;
    }
    setIsCustom(false);
  };

  // Called from the Add button — performs the write
  // Retries a pending folder-link if create+add partially failed above.
  const handleAddSelected = async () => {
    const nbId = pendingNotebookId;
    if (!nbId) return;
    // Retry: folder already exists, only re-attempt the link
    if (pendingFolderId) {
      try {
        await addNotebookToFolder(nbId, pendingFolderId);
        setImportNotice('Notebook added to folder.');
        setAddFolderOpen(false);
        setPendingFolderId(null);
      } catch (err: any) {
        setImportNotice(err.message || 'Failed to add to folder. Please try again.');
      }
      return;
    }
    if (isCustom) {
      await handleCreateAndAdd();
      return;
    }
    if (!selectedFolderId) return;
    try {
      await addNotebookToFolder(nbId, selectedFolderId);
      setImportNotice('Notebook added to folder.');
      setAddFolderOpen(false);
      setPendingFolderId(null);
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to add to folder');
    }
  };

  // Creates a new folder AND links the notebook. On partial failure
  // (folder created but link failed), retains the folder ID for retry.
  const handleCreateAndAdd = async () => {
    const nbId = pendingNotebookId;
    const name = customFolderName.trim();
    if (!name || !nbId) return;
    try {
      const folder = await createFolder(name);
      setPendingFolderId(folder.id);
      setFoldersList((prev) => [...prev, folder]);
      try {
        await addNotebookToFolder(nbId, folder.id);
        setImportNotice(`Created folder "${folder.name}" and added notebook.`);
        setAddFolderOpen(false);
        setPendingFolderId(null);
        setCustomFolderName('');
      } catch (err: any) {
        // Folder was created but link failed — keep dialog open so user can retry
        setImportNotice(
          `Folder "${folder.name}" created, but failed to add notebook. Retry?`
        );
      }
    } catch (err: any) {
      setImportNotice(err.message || 'Failed to create folder');
    }
  };

  const filteredNotebooks = notebooks.filter(nb =>
    nb.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle a date group's expanded/collapsed state.
  const toggleDay = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Which "shelf" this LibraryView is currently rendering. LibraryView is
  // also the shell for the Favorites page, so the heading and the grid
  // contents both depend on the route rather than on a separate prop.
  const isFavorites = location.pathname === '/Favorites';
  const pageHeading = isFavorites ? 'Favorites' : 'Documents';
  const visibleNotebooks = isFavorites
    ? filteredNotebooks.filter((nb) => nb.favourite)
    : filteredNotebooks;

  // Search: derive which date-group keys have at least one matching notebook.
  // Any group with matches is treated as expanded regardless of the user's
  // saved toggles so the user sees results without having to manually expand.
  const searchVisibleGroupKeys = (() => {
    if (!searchQuery) return new Set<string>();
    const q = searchQuery.toLowerCase();
    const keys = new Set<string>();
    for (const nb of visibleNotebooks) {
      if (nb.title.toLowerCase().includes(q)) keys.add(notebookDayKey(nb));
    }
    return keys;
  })();

  // The notebook whose ⋮ menu is currently open — used to label the
  // favourite action ("Mark as favourite" vs "Remove from favourites").
  const menuNotebook = notebooks.find((n) => n.id === menuNotebookId) ?? null;

  const SidebarContent = (
    <AppSidebar
      isMobile={isMobile}
      onClose={() => setIsSidebarOpen(false)}
      newButtonLabel="New Notebook"
      onNewClick={() => {
        setNewDialogOpen(true);
        if (isMobile) setIsSidebarOpen(false);
      }}
    />
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
          <Toast message={importNotice} severity="info" onClose={() => setImportNotice(null)} />
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
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: '24px', md: '34px' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pageHeading}</Typography>
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

        {/* Notebook Grid — grouped by creation date, newest first.
            Each date is a collapsible section: header with full date +
            chevron at the far right, tiles below when expanded.
            The Favorites page keeps the old flat grid (no grouping). */}
        {isFavorites ? (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(180px, 1fr))',
              md: 'repeat(auto-fill, minmax(220px, 1fr))'
            },
            gap: { xs: 2, md: 3 }
          }}>
            {visibleNotebooks.map((nb) => (
              <NotebookTile
                key={nb.id}
                nb={nb}
                onOpen={onOpenNotebook}
                returnTo={returnTo}
                onMenuOpen={handleMenuOpen}
                menuActiveId={menuNotebookId}
              />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {groupByDate(visibleNotebooks).map((group) => {
              // During search, force-expand groups that contain matching notebooks
              // without permanently changing the user's saved toggle state.
              const expanded = expandedDays.has(group.key) || searchVisibleGroupKeys.has(group.key);
              return (
                <Box key={group.key} sx={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Button control: keyboard-focusable, with aria-expanded for screen readers.
                    Styling matches the previous Box (same background, hover, rounded corners). */}
                  <button
                    type="button"
                    onClick={() => toggleDay(group.key)}
                    aria-expanded={expanded}
                    aria-label={`Toggle ${group.label}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 8px',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      background: mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
                      transition: 'background-color 0.15s',
                      color: 'inherit'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)')}
                  >
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {group.label}
                    </Typography>
                    <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                      {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </Box>
                  </button>
                  {expanded && (
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(auto-fill, minmax(180px, 1fr))',
                        md: 'repeat(auto-fill, minmax(220px, 1fr))'
                      },
                      gap: { xs: 2, md: 3 },
                      pl: 0.5,
                      mt: 1.5
                    }}>
                      {group.notebooks.map((nb) => (
                        <NotebookTile
                          key={nb.id}
                          nb={nb}
                          onOpen={onOpenNotebook}
                returnTo={returnTo}
                          onMenuOpen={handleMenuOpen}
                          menuActiveId={menuNotebookId}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

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
            <Box sx={{ mr: 1, color: menuNotebook?.favourite ? 'warning.main' : 'text.secondary' }}>
              <Star size={18} fill={menuNotebook?.favourite ? 'currentColor' : 'none'} />
            </Box>
            {menuNotebook?.favourite ? 'Remove from favourites' : 'Mark as favourite'}
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

      {/* Add to folder dialog */}
      <Dialog
        open={addFolderOpen}
        onClose={() => {
          setAddFolderOpen(false);
          setSelectedFolderId('');
          setIsCustom(false);
          setCustomFolderName('');
          setPendingFolderId(null);
        }}
        fullWidth={isMobile}
        PaperProps={{ sx: { borderRadius: 3, p: 1, width: isMobile ? '100%' : 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Add to a folder</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2, mb: 3 }}>
            <InputLabel id="folder-select-label">Folder</InputLabel>
            <Select
              labelId="folder-select-label"
              value={selectedFolderId}
              label="Folder"
              onChange={(e) => handleFolderSelect(e.target.value as string)}
              disabled={foldersLoading}
              input={<OutlinedInput label="Folder" />}
              sx={{
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
              }}
            >
              {foldersLoading ? (
                <MenuItem disabled>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    Loading folders...
                  </Box>
                </MenuItem>
              ) : foldersList.length === 0 ? (
                <MenuItem disabled>No folders yet — create one below</MenuItem>
              ) : (
                foldersList.map((folder) => (
                  <MenuItem key={folder.id} value={folder.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Folder size={16} />
                      {folder.name}
                    </Box>
                  </MenuItem>
                ))
              )}
              <MenuItem value="custom">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Plus size={16} />
                  Custom (create new)
                </Box>
              </MenuItem>
            </Select>
          </FormControl>
          {isCustom && (
            <TextField
              autoFocus
              margin="dense"
              label="Folder name"
              fullWidth
              variant="outlined"
              value={customFolderName}
              onChange={(e) => setCustomFolderName(e.target.value)}
              placeholder="e.g., Physics notes"
              sx={{ mb: 1 }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setAddFolderOpen(false)} sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleAddSelected}
            disabled={!isCustom && !selectedFolderId}
            variant="contained"
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {isCustom ? 'Create & Add' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
