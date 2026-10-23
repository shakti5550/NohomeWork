import React, { useState, useRef } from 'react';
import { IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { Mic, MicOff } from 'lucide-react';
import { SpeechRecognitionSession, isSpeechRecognitionSupported } from '../../services/stt';

interface DictationButtonProps {
  /** Called with the finalized transcript and the canvas-CSS position where it should appear. */
  onDictate: (text: string, x: number, y: number) => void;
  /** Called with the still-uncertain part of the transcript as you speak, so it can be rendered live. */
  onInterim: (text: string, x: number, y: number) => void;
  /** Last known pointer position on the canvas (CSS px) — text is placed here. */
  lastPointerPos: { x: number; y: number } | null;
  style?: React.CSSProperties;
}

/**
 * Floating microphone button for speech-to-text dictation.
 *
 * Anchored to the bottom-right of the viewport, just above the AI chat
 * button, so both quick-access actions sit together.
 *
 * Uses the Web Speech API (SpeechRecognition) for live transcription and
 * falls back gracefully when the browser doesn't support it.
 */
export const DictationButton: React.FC<DictationButtonProps> = ({ onDictate, onInterim, lastPointerPos, style = {} }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<SpeechRecognitionSession | null>(null);

  const startListening = () => {
    if (!isSpeechRecognitionSupported()) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }
    setError(null);
    const session = new SpeechRecognitionSession();
    sessionRef.current = session;

    session.start({
      // Finalized chunks are NOT committed here — committing each chunk
      // separately at the same cursor position would stack them on top of
      // each other. Instead the live overlay (onInterim) shows the full
      // running transcript, and the whole thing is committed once on stop.
      onFinal: () => {},
      onInterim: (text) => {
        const pos = lastPointerPos ?? { x: 48, y: 60 };
        onInterim(text.trim(), pos.x, pos.y);
      },
      onError: (msg) => {
        // Only surface permission/network errors; transient ones auto-restart.
        if (msg.includes('not-allowed') || msg.includes('denied')) {
          setError(msg);
        }
      },
    });
    setListening(true);
  };

  const stopListening = () => {
    const session = sessionRef.current;
    if (session) {
      const finalText = session.stop();
      if (finalText.trim()) {
        const pos = lastPointerPos ?? { x: 48, y: 60 };
        onDictate(finalText.trim(), pos.x, pos.y);
      }
      sessionRef.current = null;
    }
    setListening(false);
  };

  const toggle = () => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <>
      <style>{`
        @keyframes dictation-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
        }
      `}</style>
      <Tooltip title={error ? error : listening ? 'Stop dictation' : 'Start dictation'} placement="left">
        <IconButton
          onClick={toggle}
          aria-label={listening ? 'Stop dictation' : 'Start dictation'}
          sx={{
            position: 'fixed',
            boxSizing: 'border-box',
            width: 48,
            height: 48,
            borderRadius: '50%',
            zIndex: 999,
            // Non-listening state: let the caller override via `style`.
            // Default (laptop): grey icon on white background.
            // Tablet/mobile: black icon per editor request.
            color: listening
              ? '#ef4444'
              : (style as any)?.color ?? '#94a3b8',
            border: listening
              ? '2px solid #ef4444'
              : '2px solid transparent',
            borderColor: listening
              ? '#ef4444'
              : (style as any)?.borderColor ?? 'transparent',
            bgcolor: listening
              ? 'rgba(239, 68, 68, 0.1)'
              : (style as any)?.backgroundColor ?? 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transition: 'all 0.15s ease',
            ...(listening ? { animation: 'dictation-pulse 1.2s ease-in-out infinite' } : {}),
            '&:hover': {
              bgcolor: listening
                ? 'rgba(239, 68, 68, 0.2)'
                : (style as any)?.backgroundColor ?? '#ffffff',
              color: listening
                ? '#ef4444'
                : (style as any)?.color ?? '#2563eb',
              transform: 'scale(1.08)',
            },
            WebkitTapHighlightColor: 'transparent',
            ...style
          }}
        >
          {listening ? <MicOff size={isMobile ? 20 : 24} /> : <Mic size={isMobile ? 20 : 24} />}
        </IconButton>
      </Tooltip>
      {error && (
        <Tooltip title={error} placement="top" open>
          <span style={{ position: 'fixed', right: 16, bottom: 88, width: 0, height: 0 }} />
        </Tooltip>
      )}
    </>
  );
};