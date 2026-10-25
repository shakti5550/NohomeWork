import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Alert as MuiAlert, useMediaQuery, useTheme
} from '@mui/material';

interface ToastProps {
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, severity = 'info', duration = 5000, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [visible, setVisible] = useState(true);
  const onCloseRef = useRef(onClose);

  // Keep the ref up to date so the timer always calls the latest callback
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Reset visible when a new notice arrives
    setVisible(true);

    const expiryTimer = setTimeout(() => {
      setVisible(false);
      // Store the delay timer so it can be cancelled if a new notice arrives
      const delayTimer = setTimeout(onCloseRef.current, 250);
      // Expose it for cleanup
      return () => clearTimeout(delayTimer);
    }, duration);

    return () => {
      clearTimeout(expiryTimer);
    };
  }, [message, duration]); // restart only when notice or duration changes

  if (!visible) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: isMobile ? 12 : 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 24px)',
        maxWidth: isMobile ? 340 : 480,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <MuiAlert
        severity={severity}
        variant="filled"
        sx={{
          width: 'fit-content',
          minWidth: 200,
          maxWidth: '100%',
          borderRadius: 2,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          fontSize: '14px',
          py: 0.5,
          px: 1.5,
          animation: 'toastIn 0.25s ease-out',
          '@keyframes toastIn': {
            from: { opacity: 0, transform: 'translateY(-8px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '& .MuiAlert-icon': { fontSize: 18 },
          '& .MuiAlert-message': { fontSize: '14px', fontWeight: 500 },
        }}
      >
        {message}
      </MuiAlert>
    </Box>
  );
};
