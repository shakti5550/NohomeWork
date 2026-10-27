import React from 'react';
import { IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { Sparkles } from 'lucide-react';
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
    <Tooltip title={isOpen ? 'Close Homie' : 'Chat with Homie'} placement="left">
      <IconButton
        onClick={onClick}
        aria-label="Homie chat"
        sx={{
          position: 'fixed',
          boxSizing: 'border-box',
          width: 48,
          height: 48,
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
          border: '1px solid',
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
        <Sparkles size={isMobile ? 22 : 26} />
      </IconButton>
    </Tooltip>
  );
};