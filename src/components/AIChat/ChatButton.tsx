import React from 'react';
import { IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { Bot } from 'lucide-react';
import { useThemeMode } from '../../ThemeContext';

interface ChatButtonProps {
  onClick: () => void;
  isOpen: boolean;
  style?: React.CSSProperties;
}

/**
 * Floating AI button anchored to the bottom-right of the editor canvas.
 * Uses `position: fixed` so it stays visible while the canvas scrolls.
 */
export const ChatButton: React.FC<ChatButtonProps> = ({ onClick, isOpen, style }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { mode } = useThemeMode();

  return (
    <Tooltip title={isOpen ? 'Close AI chat' : 'Chat with AI assistant'} placement="left">
      <IconButton
        onClick={onClick}
        aria-label="AI chat"
        sx={{
          position: 'fixed',
          right: { xs: 12, sm: 16 },
          bottom: { xs: 12, sm: 16 },
          width: { xs: 48, sm: 56 },
          height: { xs: 48, sm: 56 },
          borderRadius: '50%',
          zIndex: 1000,
          bgcolor: isOpen
            ? mode === 'dark'
              ? '#1e3a8a'
              : '#2563eb'
            : mode === 'dark'
              ? '#1e293b'
              : '#ffffff',
          color: isOpen
            ? '#ffffff'
            : mode === 'dark'
              ? '#f8fafc'
              : '#2563eb',
          border: '2px solid',
          borderColor: '#2563eb',
          boxShadow: '0 6px 20px rgba(37, 99, 235, 0.35)',
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'scale(1.08)',
            bgcolor: '#2563eb',
            color: '#ffffff',
          },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Prevent the button from stealing focus from the canvas while drawing.
          WebkitTapHighlightColor: 'transparent',
          ...style
        }}
      >
        <Bot size={isMobile ? 22 : 26} />
      </IconButton>
    </Tooltip>
  );
};