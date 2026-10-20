import React, { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter as Router, Routes, Route, Navigate, useNavigate,
  useParams
} from 'react-router-dom';
import { LibraryView } from './components/LibraryView';
import { EditorView } from './components/Editor/EditorView';
import { Notebook, getNotebook } from './storage/db';
import { AuthPage } from './components/Auth/AuthPage';
import { CustomThemeProvider } from './ThemeContext';
import { supabase } from './storage/supabaseClient';

// ─── Editor route wrapper — loads the notebook by id from the URL ──────
const EditorRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notebook, setNotebook] = useState<Notebook | null>(null);

  useEffect(() => {
    if (id) {
      getNotebook(id).then((nb) => setNotebook(nb ?? null));
    } else {
      setNotebook(null);
    }
  }, [id]);

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
      onBack={() => navigate('/Home', { replace: true })}
      onUpdateNotebook={(updated) => setNotebook(updated)}
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
        <LibraryView onOpenNotebook={(id) => navigate('/Editor/' + id)} onSignOut={handleSignOut} />
      } />
      <Route path="/Editor/:id" element={<EditorRoute />} />
      <Route path="*" element={<Navigate to="/Home" replace />} />
    </Routes>
  );
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