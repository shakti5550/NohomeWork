import React from 'react';
import { Box, Typography } from '@mui/material';
import { useThemeMode } from '../ThemeContext';

export const AppLogo: React.FC<{ size?: number; showText?: boolean }> = ({ size = 36, showText = true }) => {
  const { mode } = useThemeMode();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', userSelect: 'none' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0px 4px 10px rgba(0, 0, 0, 0.25))' }}
      >
        <rect width="128" height="128" rx="28" fill="#000000" />
        <line x1="42" y1="46" x2="72" y2="46" stroke="white" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.95" />
        <line x1="42" y1="58" x2="72" y2="58" stroke="white" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.95" />
        <line x1="42" y1="70" x2="60" y2="70" stroke="white" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.95" />
        <path
          d="M48 94 L66 52 L88 40 L74 88"
          stroke="#FBBF24"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && (
        <Typography
          variant="h6"
          sx={{
            fontWeight: 800,
            background: mode === 'dark'
              ? 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)'
              : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px'
          }}
        >
          NohomeWork
        </Typography>
      )}
    </Box>
  );
};
