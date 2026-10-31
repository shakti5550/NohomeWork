import React, { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter as Router, Routes, Route, Navigate, useNavigate,
  useParams, useSearchParams
} from 'react-router-dom';
import { LibraryView } from './components/LibraryView';
import { FoldersView } from './components/FoldersView';
import { FolderDetail } from './components/FolderDetail';
import { BookmarksView } from './components/BookmarksView';
import { TrashView } from './components/TrashView';
import { EditorView } from './components/Editor/EditorView';
import { Notebook, getNotebook } from './storage/cloud';
import { AuthPage } from './components/Auth/AuthPage';
import { CustomThemeProvider } from './ThemeContext';
import { supabase } from './storage/supabaseClient';

// ─── Folder detail route wrapper ───────────────────────────────────────
const FolderDetailRoute: React.FC<{ onSignOut: () => void }> = ({ onSignOut }) => {
  const { folderId } = useParams<{ folderId: string }>();
  return <FolderDetail folderId={folderId!} onSignOut={onSignOut} />;
};

// ─── Editor route wrapper — loads the notebook by id from the URL ──────
const EditorRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [notebook, setNotebook] = useState<Notebook | null>(null);

  useEffect(() => {
    if (id) {
      getNotebook(id).then((nb) => setNotebook(nb ?? null));
    } else {
      setNotebook(null);
    }
  }, [id]);

  // A bookmark link may carry ?page=N (1-based). Resolve it to a 0-based
  // index once the notebook is loaded so the editor opens on that page.
  const requestedPage = (() => {
    const raw = searchParams.get('page');
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n - 1 : undefined;
  })();
  // Where the editor's Back button should send us. Absent = fall back to /Home.
  const returnTo = searchParams.get('returnTo') ?? undefined;

  if (!id || !notebook) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        justifyContent: 'center', alignItems: 'center',
        background: '#0f172a', color: '#f8fafc', fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <EditorView
      notebook={notebook}
      onBack={(returnTo) => navigate(returnTo || '/Home', { replace: true })}
      onUpdateNotebook={(updated) => setNotebook(updated)}
      initialPage={requestedPage}
      returnTo={returnTo}
    />
  );
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();

  const handleSignInSuccess = () => {
    navigate('/Home', { replace: true });
  };

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  }, [navigate]);

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage onSuccess={handleSignInSuccess} />} />
      <Route path="/Home" element={
        <AuthGuard>
          <LibraryView onOpenNotebook={(id, returnTo) => {
              const q = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
              navigate(`/Editor/${id}${q}`);
            }} onSignOut={handleSignOut} />
        </AuthGuard>
      } />
      <Route path="/Favorites" element={
        <AuthGuard>
          <LibraryView onOpenNotebook={(id, returnTo) => {
              const q = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
              navigate(`/Editor/${id}${q}`);
            }} onSignOut={handleSignOut} returnTo="/Favorites" />
        </AuthGuard>
      } />
      <Route path="/Bookmarks" element={
        <AuthGuard>
          <BookmarksView onSignOut={handleSignOut} />
        </AuthGuard>
      } />
      <Route path="/Trash" element={
        <AuthGuard>
          <TrashView onSignOut={handleSignOut} />
        </AuthGuard>
      } />
      <Route path="/Folders" element={
        <AuthGuard>
          <FoldersView onSignOut={handleSignOut} />
        </AuthGuard>
      } />
      <Route path="/Folders/:folderId" element={
        <AuthGuard>
          <FolderDetailRoute onSignOut={handleSignOut} />
        </AuthGuard>
      } />
      <Route path="/Editor/:id" element={
        <AuthGuard>
          <EditorRoute />
        </AuthGuard>
      } />
      <Route path="*" element={<Navigate to="/Home" replace />} />
    </Routes>
  );
};

// ─── Auth guard — redirects to /auth if the user is not signed in ───────
const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setSignedIn(!!user);
      setChecking(false);
      if (!user) navigate('/auth', { replace: true });
    };
    check();

    // Re-check when auth state changes (e.g. session restored on reload)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
      if (!session?.user) navigate('/auth', { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (checking) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        justifyContent: 'center', alignItems: 'center',
        background: '#0f172a', color: '#f8fafc', fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  return signedIn ? <>{children}</> : null;
};

export const App: React.FC = () => {
  return (
    <CustomThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </CustomThemeProvider>
  );
};

export default App;