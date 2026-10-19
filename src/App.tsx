import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { LibraryView } from './components/LibraryView';
import { EditorView } from './components/Editor/EditorView';
import { Notebook, getNotebook, saveNotebook } from './storage/db';
import { AuthPage } from './components/Auth/AuthPage';
import { CustomThemeProvider } from './ThemeContext';

const AppContent: React.FC = () => {
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeNotebookId) {
      getNotebook(activeNotebookId).then((nb) => {
        if (nb) setActiveNotebook(nb);
      });
    } else {
      setActiveNotebook(null);
    }
  }, [activeNotebookId]);

  const handleSignOut = () => {
    navigate('/auth');
  };

  const handleSignInSuccess = () => {
    navigate('/');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      {location.pathname === '/auth' ? (
        <AuthPage onBack={() => navigate('/')} onSuccess={handleSignInSuccess} />
      ) : (
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
      )}
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