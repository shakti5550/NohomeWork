import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { LibraryView } from './components/LibraryView';
import { EditorView } from './components/Editor/EditorView';
import { Notebook, getNotebook, saveNotebook } from './storage/db';
import { AuthPage } from './components/Auth/AuthPage';
import { CustomThemeProvider } from './ThemeContext';
import { supabase } from './storage/supabaseClient';

const AppContent: React.FC = () => {
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Check initial auth state
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      setAuthChecked(true);
      if (!session) {
        navigate('/auth');
      }
    };
    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        setIsAuthenticated(true);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (activeNotebookId) {
      getNotebook(activeNotebookId).then((nb) => {
        if (nb) setActiveNotebook(nb);
      });
    } else {
      setActiveNotebook(null);
    }
  }, [activeNotebookId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleSignInSuccess = () => {
    navigate('/');
  };

  // Show loading state while checking auth
  if (!authChecked) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      {location.pathname === '/auth' ? (
        <AuthPage onSuccess={handleSignInSuccess} />
      ) : isAuthenticated ? (
        activeNotebook ? (
          <EditorView
            notebook={activeNotebook}
            onBack={() => setActiveNotebookId(null)}
            onUpdateNotebook={(updated) => setActiveNotebook(updated)}
          />
        ) : (
          <LibraryView
            onOpenNotebook={(id) => setActiveNotebookId(id)}
            onSignOut={handleSignOut}
          />
        )
      ) : null}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <CustomThemeProvider>
      <Router>
        <Routes>
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </Router>
    </CustomThemeProvider>
  );
};

export default App;