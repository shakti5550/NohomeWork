import React, { useState, useEffect } from 'react';
import {
  Box, Drawer, Typography, Skeleton, Alert, Button, IconButton,
  useMediaQuery, useTheme
} from '@mui/material';
import {
  Bookmark as BookmarkIcon, Search as SearchIcon, Menu as MenuIcon, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeMode } from '../ThemeContext';
import { ProfileDropdown } from './Auth/ProfileDropdown';
import { getBookmarkedPages, BookmarkEntry, setPageBookmarked } from '../storage/cloud';
import { AppSidebar } from './AppSidebar';
import { Toast } from './Toast';

interface NotebookGroup {
  notebookId: string;
  notebookTitle: string;
  notebookCoverColor: string;
  pages: BookmarkEntry[];
}

interface BookmarksViewProps {
  onSignOut: () => void;
}

export const BookmarksView: React.FC<BookmarksViewProps> = ({ onSignOut }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { mode, toggleTheme } = useThemeMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Collapsed state for notebook groups (keyed by notebookId)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  const loadBookmarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBookmarkedPages();
      setBookmarks(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load bookmarks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, []);

  const handleToggleBookmark = async (pageId: string, currentStatus: boolean) => {
    try {
      await setPageBookmarked(pageId, !currentStatus);
      // Optimistic update
      setBookmarks(prev => prev.filter(p => p.pageId !== pageId));
      setToastMsg(currentStatus ? 'Removed from bookmarks' : 'Added to bookmarks');
    } catch (err: any) {
      setToastMsg(err.message || 'Failed to update bookmark');
    }
  };

  const toggleGroup = (notebookId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(notebookId)) next.delete(notebookId);
      else next.add(notebookId);
      return next;
    });
  };

  // Filter bookmarks by notebook title (case-insensitive)
  const q = searchQuery.trim().toLowerCase();
  const filteredBookmarks = q
    ? bookmarks.filter(b => b.notebookTitle.toLowerCase().includes(q))
    : bookmarks;

  // Group bookmarks by notebook
  const grouped: NotebookGroup[] = [];
  const map = new Map<string, NotebookGroup>();
  for (const b of filteredBookmarks) {
    if (!map.has(b.notebookId)) {
      map.set(b.notebookId, {
        notebookId: b.notebookId,
        notebookTitle: b.notebookTitle,
        notebookCoverColor: b.notebookCoverColor,
        pages: []
      });
    }
    map.get(b.notebookId)!.pages.push(b);
  }
  grouped.push(...map.values());

  const SidebarContent = (
    <AppSidebar
      isMobile={isMobile}
      onClose={() => setIsSidebarOpen(false)}
      newButtonLabel="New Notebook"
      onNewClick={() => navigate('/Home')}
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
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'center' },
            justifyContent: 'space-between',
            gap: { xs: 2, md: 0 }
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
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: '24px', md: '34px' } }}>
                Bookmarks
              </Typography>
              <Box sx={{ ml: 'auto', display: { xs: 'flex', md: 'none' } }}>
                <ProfileDropdown onSignOut={onSignOut} mode={mode} toggleTheme={toggleTheme} />
              </Box>
            </Box>

            <Box sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 1.5
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
                width: 300
              }}>
                <SearchIcon size={18} color="#94a3b8" />
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
                <SearchIcon size={18} color="#94a3b8" />
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

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={loadBookmarks}>Retry</Button>}>
            {error}
          </Alert>
        )}
        {toastMsg && <Toast message={toastMsg} severity="info" onClose={() => setToastMsg(null)} />}

        {/* Content */}
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[1, 2, 3].map(i => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))}
          </Box>
        ) : grouped.length === 0 ? (
          <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
            <BookmarkIcon size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>No bookmarks yet</Typography>
            <Typography variant="body2">
              Open a notebook, click the Pages button, and double-tap a page to bookmark it.
            </Typography>
            <Button 
              variant="contained" 
              sx={{ mt: 3 }} 
              onClick={() => navigate('/Home')}
            >
              Go to Documents
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {grouped.map(group => {
              const isCollapsed = collapsed.has(group.notebookId);
              return (
                <Box key={group.notebookId} sx={{ 
                  bgcolor: 'background.paper', 
                  borderRadius: 2, 
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  {/* Notebook Header */}
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      py: 1,
                      px: 2,
                      cursor: 'pointer',
                      bgcolor: '#2563eb',
                      color: '#fff',
                      '&:hover': { bgcolor: '#1d4ed8' }
                    }}
                    onClick={() => toggleGroup(group.notebookId)}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ 
                        width: 3, 
                        height: 16, 
                        bgcolor: 'rgba(255,255,255,0.6)', 
                        borderRadius: 1 
                      }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '14px' }}>
                        {group.notebookTitle}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8, bgcolor: 'rgba(255,255,255,0.2)', px: 0.75, py: 0.25, borderRadius: 1, fontSize: '12px' }}>
                        {group.pages.length} page{group.pages.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </Box>

                  {/* Pages List — one horizontal row per notebook, scrollable sideways so
                    a notebook's bookmarked pages never wrap into a second row. */}
                  {!isCollapsed && (
                    <Box sx={{ p: 2, display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 2, scrollbarWidth: 'thin' }}>
                      {group.pages.map(page => (
                        <Box 
                          key={page.pageId}
                          sx={{
                            position: 'relative',
                            flex: '0 0 auto',
                            width: 140,
                            aspectRatio: '3/4',
                            bgcolor: '#f8fafc',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            cursor: 'pointer',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }
                          }}
                          onClick={() => navigate(`/Editor/${page.notebookId}?page=${page.pageNumber}&returnTo=/Bookmarks`)}
                        >
                          {/* Page Number */}
                          <Box sx={{ 
                            position: 'absolute', 
                            top: 8, 
                            left: 8, 
                            bgcolor: 'rgba(0,0,0,0.06)', 
                            borderRadius: 1, 
                            px: 1, 
                            py: 0.3,
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            P{page.pageNumber}
                          </Box>

                          {/* Bookmark Remove Button */}
                          <IconButton
                            size="small"
                            sx={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              bgcolor: 'rgba(255,255,255,0.9)',
                              color: '#ef4444',
                              '&:hover': { bgcolor: '#fff', color: '#dc2626' }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleBookmark(page.pageId, true);
                            }}
                          >
                            <X size={14} />
                          </IconButton>

                          {/* Center Content */}
                          <Box sx={{ 
                            position: 'absolute', 
                            inset: 0, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexDirection: 'column',
                            gap: 1
                          }}>
                            <BookmarkIcon size={24} color="#3b82f6" />
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                              {page.template}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
};
