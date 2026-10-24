import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Slider, Drawer, TextField, useMediaQuery
} from '@mui/material';
import {
  ArrowLeft, PenTool, Highlighter, Eraser, Plus, Trash2, ChevronLeft, ChevronRight,
  Bot, X, Send, Pencil
} from 'lucide-react';
import { Notebook, Page, Stroke, TextAnnotation, saveNotebook, ChatMessage } from '../../storage/cloud';
import { ChatButton } from '../AIChat/ChatButton';
import { DictationButton } from '../AIChat/DictationButton';
import { sendMessage } from '../../services/ai';
import { useThemeMode } from '../../ThemeContext';

interface EditorViewProps {
  notebook: Notebook;
  onBack: () => void;
  onUpdateNotebook: (updated: Notebook) => void;
}

type Tool = 'pen' | 'highlighter' | 'eraser';
type Template = 'blank' | 'ruled' | 'grid' | 'dotted';

// Predefined colors for the palette
const PRESET_COLORS = ['#000000', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777'];

export const EditorView: React.FC<EditorViewProps> = ({ notebook, onBack, onUpdateNotebook }) => {
  const { mode } = useThemeMode();
  const isLandscape = useMediaQuery('(orientation: landscape)');

  // Drawing state
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(3);
  const [template, setTemplate] = useState<Template>('ruled');

  // UI state
  const [toolDialogOpen, setToolDialogOpen] = useState(false);
  const [paginationVisible, setPaginationVisible] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Pagination state
  const paginationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const paginationRef = useRef<HTMLDivElement | null>(null);

  // Track pointer position for dictation
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Live (interim) transcript — rendered on the canvas as you speak so text
  // appears in real time instead of only when you tap stop. Cleared when a
  // finalized sentence arrives or dictation ends.
  const [interimAnnotation, setInterimAnnotation] = useState<TextAnnotation | null>(null);

  // AI chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(notebook.aiChat ?? []);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Drawing refs
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);

  const currentPage: Page = notebook.pages[currentPageIndex] || notebook.pages[0];

  // Canvas area measurement
  const [canvasAreaSize, setCanvasAreaSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = r.width - padH;
      const availH = r.height - padV;
      setCanvasAreaSize({ width: availW, height: availH });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const availHeight = canvasAreaSize.height;
  const availWidth = Math.max(0, canvasAreaSize.width);

  // Tablet / mobile portrait — narrower than a laptop. These screens get the
  // compact styling (black icons, back-button-style floating buttons) and a
  // taller paper so the extra top space is used.
  const isTabletMobile = useMediaQuery('(max-width: 900px)');

  // Short viewports (phones in landscape, split windows, short tablets) can't
  // fit the full vertical button stack without clipping the bottom button.
  // On these screens the controls collapse into a horizontal bottom row.
  const isShortViewport = useMediaQuery('(max-height: 364px)');

  // Tablet held vertically — a horizontal top row keeps the controls clear of
  // the status bar and the top of the paper, in the same left-to-right order.
  const isTabletPortrait = useMediaQuery('(min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');

  // When the vertical left stack is active it occupies 16..64px, so the canvas
  // container gets left padding to keep the paper clear of the buttons.
  // Top-row and bottom-strip layouts don't need this.
  // Stored as a pixel string: pl is a MUI spacing prop and would multiply
  // a raw number by the theme spacing factor (80 -> 640px).
  const canvasLeftPad = (!isTabletPortrait && !isShortViewport) ? '24px' : '0px';

  // Tablet held vertically: the top button row sits just below the status bar,
  // so the canvas needs extra top padding to keep the paper clear of it.
  const landscapeRatioNum = isLandscape
    ? Math.max(1.25, Math.min(availWidth / Math.max(1, availHeight), 1.6))
    : 1.25;
  const pageMaxHeight = isLandscape ? Math.max(0, availHeight) : 0;
  const pageMaxWidth = isLandscape && pageMaxHeight > 0
    ? Math.min(availWidth, pageMaxHeight * landscapeRatioNum)
    : 0;

  // Paper height: fill more of the viewport on tablet/mobile so the empty
  // top space is used. Laptop keeps the existing behavior.
  const paperMaxHeight = isLandscape && pageMaxHeight > 0
    ? `${pageMaxHeight}px`
    : isTabletPortrait ? '100%'
      : isTabletMobile ? '96vh'
        : { xs: '82vh', sm: '88vh', md: 'none' };
  // Decomposed into explicit side paddings. `pt` must always have a value:
  // `pt: canvasTopPad` (undefined on non-tablet) would otherwise wipe out the
  // responsive top padding from `p` and let the paper overlap the controls.
  const canvasPadSide = isTabletMobile ? 0.25 : { xs: 0.25, sm: 0.5, md: 1 };
  const canvasPadTop = isTabletPortrait ? '72px' : canvasPadSide;

  // Notebook ref for callbacks
  const notebookRef = useRef(notebook);
  notebookRef.current = notebook;
  const pageIndexRef = useRef(currentPageIndex);
  pageIndexRef.current = currentPageIndex;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateCurrentNotebook = useCallback((newPages: Page[], persistDelay = 400) => {
    const updated: Notebook = {
      ...notebookRef.current,
      pages: newPages,
      updatedAt: Date.now()
    };
    onUpdateNotebook(updated);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveNotebook(updated);
    }, persistDelay);
  }, [onUpdateNotebook]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        saveNotebook(notebookRef.current);
      }
    };
  }, []);

  // ─── Pagination controls ──────────────────────────────────────────────────
  const showPagination = useCallback(() => {
    setPaginationVisible(true);
    if (paginationTimeoutRef.current) clearTimeout(paginationTimeoutRef.current);
    paginationTimeoutRef.current = setTimeout(() => {
      setPaginationVisible(false);
    }, 3000);
  }, []);

  const goToPrevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
      showPagination();
    }
  }, [currentPageIndex, showPagination]);

  const goToNextPage = useCallback(() => {
    if (currentPageIndex < notebook.pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
      showPagination();
    }
  }, [currentPageIndex, notebook.pages.length, showPagination]);

  // Touch/swipe handling
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      const dt = Date.now() - touchStartRef.current.time;

      // Only trigger on horizontal swipes faster than 200ms
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 500) {
        if (dx < 0) goToNextPage();
        else goToPrevPage();
      }
      touchStartRef.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [goToNextPage, goToPrevPage]);

  // Cleanup pagination timer on unmount
  useEffect(() => {
    return () => {
      if (paginationTimeoutRef.current) clearTimeout(paginationTimeoutRef.current);
    };
  }, []);

  // ─── Page operations ──────────────────────────────────────────────────────
  const handleAddPage = () => {
    const newPage: Page = {
      id: 'pg_' + Math.random().toString(36).substring(2, 9),
      pageNumber: notebook.pages.length + 1,
      template,
      strokes: []
    };
    const updatedPages = [...notebook.pages, newPage];
    updateCurrentNotebook(updatedPages, 0);
    setCurrentPageIndex(updatedPages.length - 1);
    showPagination();
  };

  const handleDeletePage = () => {
    if (notebook.pages.length <= 1) {
      alert('A notebook must have at least one page.');
      return;
    }
    const updatedPages = notebook.pages.filter((_, idx) => idx !== currentPageIndex);
    updateCurrentNotebook(updatedPages, 0);
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
  };

  const handleChangeTemplate = (t: Template) => {
    const updatedPages = [...notebook.pages];
    updatedPages[currentPageIndex] = { ...currentPage, template: t };
    updateCurrentNotebook(updatedPages, 0);
    setTemplate(t);
  };

  // ─── Canvas drawing ───────────────────────────────────────────────────────
  const drawTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number, tpl: string) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    if (tpl === 'ruled') {
      const lineHeight = 32;
      for (let y = 60; y < height; y += lineHeight) {
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(width - 40, y);
        ctx.stroke();
      }
    } else if (tpl === 'grid') {
      const gridSize = 32;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (tpl === 'dotted') {
      const dotSize = 32;
      ctx.fillStyle = '#cbd5e1';
      for (let x = 32; x < width; x += dotSize) {
        for (let y = 32; y < height; y += dotSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number, font: string): string[] => {
    if (maxWidth <= 0) return [];
    ctx.font = `${fontSize}px ${font}`;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (paragraph.length === 0) {
        lines.push('');
        continue;
      }
      let line = '';
      const words = paragraph.split(' ');
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = line.length === 0 ? word : line + ' ' + word;
        if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line.length > 0 && ctx.measureText(line).width > maxWidth) {
        let chunk = '';
        for (const ch of line) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk.length > 0) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        if (chunk.length > 0) lines.push(chunk);
      } else if (line.length > 0) {
        lines.push(line);
      } else {
        lines.push('');
      }
    }
    return lines;
  };

  const drawTextAnnotation = (ctx: CanvasRenderingContext2D, ann: TextAnnotation, canvasWidth: number, canvasHeight: number) => {
    ctx.save();
    ctx.textBaseline = 'top';

    // Clamp x to stay within canvas bounds (left margin + right margin)
    const leftMargin = 8;
    const rightMargin = 24;
    const clampedX = Math.max(leftMargin, Math.min(ann.x, canvasWidth - rightMargin - 1));
    const maxWidth = canvasWidth - clampedX - rightMargin;

    if (maxWidth <= 0 || canvasHeight <= 0) {
      ctx.restore();
      return;
    }
    const MIN_FONT = 10;
    const LINE_HEIGHT_RATIO = 1.4;
    let fontSize = ann.fontSize;
    let lines = wrapText(ctx, ann.text, maxWidth, fontSize, ann.font);
    let lineHeight = fontSize * LINE_HEIGHT_RATIO;
    let blockHeight = lines.length * lineHeight;

    if (blockHeight > canvasHeight) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const needed = canvasHeight / blockHeight;
        fontSize = Math.max(MIN_FONT, fontSize * Math.min(1, needed));
        ctx.font = `${fontSize}px ${ann.font}`;
        lines = wrapText(ctx, ann.text, maxWidth, fontSize, ann.font);
        lineHeight = fontSize * LINE_HEIGHT_RATIO;
        blockHeight = lines.length * lineHeight;
        if (blockHeight <= canvasHeight || fontSize <= MIN_FONT) break;
      }
    }

    let startY = ann.y;
    if (startY + blockHeight > canvasHeight) {
      startY = Math.max(0, canvasHeight - blockHeight - 8);
    }

    ctx.font = `${fontSize}px ${ann.font}`;
    ctx.fillStyle = ann.color;
    lines.forEach((line, i) => ctx.fillText(line, clampedX, startY + i * lineHeight));
    ctx.restore();
  };

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length === 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = stroke.opacity;
    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  };

  useEffect(() => {
    if (isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const bw = Math.round(rect.width * dpr);
    const bh = Math.round(rect.height * dpr);

    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawTemplate(ctx, rect.width, rect.height, template);

    currentPage.strokes.forEach((stroke) => drawStroke(ctx, stroke));
    (currentPage.textAnnotations ?? []).forEach((ann) => drawTextAnnotation(ctx, ann, rect.width, rect.height));
    if (interimAnnotation) drawTextAnnotation(ctx, interimAnnotation, rect.width, rect.height);
  }, [currentPage, pageMaxHeight, pageMaxWidth, isLandscape, template, interimAnnotation, canvasAreaSize.width, canvasAreaSize.height]);

  const stopDrawing = () => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    const nb = notebookRef.current;
    const idx = pageIndexRef.current;
    const page = nb.pages[idx];
    const updatedPages = [...nb.pages];
    updatedPages[idx] = { ...page, strokes: [...page.strokes, stroke] };
    updateCurrentNotebook(updatedPages);
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isDrawingRef.current) stopDrawing();
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch { }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setLastPointerPos({ x, y });

    if (tool === 'eraser') {
      eraseStrokeAt(x, y);
      return;
    }

    activePointerIdRef.current = e.pointerId;
    isDrawingRef.current = true;
    currentStrokeRef.current = {
      id: 'st_' + Math.random().toString(36).substring(2, 9),
      tool,
      color,
      width: tool === 'highlighter' ? width * 4 : width,
      opacity: tool === 'highlighter' ? 0.4 : 1.0,
      points: [{ x, y }]
    };
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setLastPointerPos({ x, y });
    const stroke = currentStrokeRef.current;
    const lastPt = stroke.points[stroke.points.length - 1];
    stroke.points.push({ x, y });
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = stroke.opacity;
    if (stroke.tool === 'highlighter') ctx.globalCompositeOperation = 'multiply';
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  };

  const handleWindowPointerEnd = useCallback((e: PointerEvent) => {
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    stopDrawing();
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [handleWindowPointerEnd]);

  const eraseStrokeAt = (x: number, y: number) => {
    const radius = 15;
    const filteredStrokes = currentPage.strokes.filter((stroke) => {
      return !stroke.points.some((pt) => Math.hypot(pt.x - x, pt.y - y) < radius);
    });
    if (filteredStrokes.length !== currentPage.strokes.length) {
      const updatedPages = [...notebook.pages];
      updatedPages[currentPageIndex] = { ...currentPage, strokes: filteredStrokes };
      updateCurrentNotebook(updatedPages);
    }
  };

  const handleDictate = (text: string, x: number, y: number) => {
    const ann: TextAnnotation = {
      id: 'ta_' + Math.random().toString(36).substring(2, 9),
      x, y,
      text,
      font: 'system-ui',
      fontSize: width * 5 + 8,
      color,
      createdAt: Date.now(),
    };
    const nb = notebookRef.current;
    const idx = pageIndexRef.current;
    const page = nb.pages[idx];
    const updatedPages = [...nb.pages];
    updatedPages[idx] = { ...page, textAnnotations: [...(page.textAnnotations ?? []), ann] };
    updateCurrentNotebook(updatedPages);
    // A finalized sentence is committed — clear the live interim so it
    // doesn't double-render or linger on the next sentence.
    setInterimAnnotation(null);
  };

  /** Renders the still-uncertain part of the transcript live on the canvas. */
  const handleInterim = (text: string, x: number, y: number) => {
    if (!text.trim()) {
      setInterimAnnotation(null);
      return;
    }
    setInterimAnnotation({
      id: 'interim',
      x, y,
      text,
      font: 'system-ui',
      fontSize: width * 5 + 8,
      color,
      createdAt: Date.now(),
    });
  };

  // ─── AI chat ──────────────────────────────────────────────────────────────
  const persistChat = useCallback((messages: ChatMessage[]) => {
    const updated: Notebook = { ...notebookRef.current, aiChat: messages, updatedAt: Date.now() };
    onUpdateNotebook(updated);
    saveNotebook(updated);
  }, [onUpdateNotebook]);

  const handleSendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isSending) return;
    const userMessage: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatError(null);
    setIsSending(true);
    try {
      const { response } = await sendMessage(text, chatMessages);
      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      const withReply = [...nextMessages, assistantMessage];
      setChatMessages(withReply);
      persistChat(withReply);
    } catch (err: any) {
      setChatError(err.message || 'Something went wrong');
    } finally {
      setIsSending(false);
    }
  }, [chatInput, chatMessages, isSending, persistChat]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const FloatingBtn = ({ onClick, icon, tooltip, style }: { onClick: () => void; icon: React.ReactNode; tooltip: string; style?: React.CSSProperties }) => (
    <Tooltip title={tooltip} placement="top">
      <IconButton
        onClick={onClick}
        sx={{
          position: 'fixed',
          boxSizing: 'border-box',
          width: 48,
          height: 48,
          borderRadius: '50%',
          bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#ffffff',
          // Tablet/mobile: black icons always (except delete). Laptop: respect theme.
          color: isTabletMobile
            ? '#1e293b'
            : (style as any)?.color ?? (mode === 'dark' ? '#f8fafc' : '#1e293b'),
          border: '1px solid',
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          backdropFilter: 'blur(8px)',
          zIndex: 100,
          transition: 'all 0.2s ease',
          '&:hover': { transform: 'scale(1.1)', boxShadow: '0 6px 16px rgba(0,0,0,0.2)' },
          ...style
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  // Force immediate save before navigating away
  const handleBack = useCallback(async () => {
    // Flush any pending debounced save immediately
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // Ensure current stroke is committed
    if (isDrawingRef.current && currentStrokeRef.current) {
      stopDrawing();
    }
    // Log strokes before save for debugging
    const strokes = notebookRef.current.pages[pageIndexRef.current]?.strokes;
    console.log('[Editor] Saving', strokes?.length ?? 0, 'strokes before back');
    // Wait for save to complete before navigating
    try {
      await saveNotebook(notebookRef.current);
      console.log('[Editor] Save completed');
    } catch (err) {
      console.error('[Editor] Save failed:', err);
    }
    onBack();
  }, [onBack]);

  // The six floating controls, in vertical order. On short viewports the
  // stack collapses into a horizontal bottom row so nothing is clipped off.
  const floatButtons: { comp: React.ElementType; props: Record<string, any> }[] = [
    {
      comp: FloatingBtn,
      props: {
        onClick: handleBack,
        tooltip: 'Back to Library',
        icon: <ArrowLeft size={20} />,
        style: { top: 16, left: 16 },
      },
    },
    {
      comp: FloatingBtn,
      props: {
        onClick: () => setToolDialogOpen(true),
        tooltip: 'Tools & Settings',
        icon: <Pencil size={20} />,
        style: { top: 76, left: 16 },
      },
    },
    {
      comp: FloatingBtn,
      props: {
        onClick: handleAddPage,
        tooltip: 'Add Page',
        icon: <Plus size={20} />,
        style: { top: 136, left: 16 },
      },
    },
    {
      comp: FloatingBtn,
      props: {
        onClick: handleDeletePage,
        tooltip: 'Delete Page',
        icon: <Trash2 size={20} />,
        style: { top: 196, left: 16, color: '#ef4444', borderColor: '#fecaca' },
      },
    },
    {
      comp: DictationButton,
      props: {
        onDictate: handleDictate,
        onInterim: handleInterim,
        lastPointerPos: lastPointerPos,
        style: {
          top: 256, left: 16,
          backgroundColor: mode === 'dark' ? '#1e293b' : '#ffffff',
          color: mode === 'dark' ? '#f8fafc' : '#64748b',
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
        },
      },
    },
    {
      comp: ChatButton,
      props: {
        onClick: () => setChatOpen((o) => !o),
        isOpen: chatOpen,
        style: { top: 316, left: 16 },
      },
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden' }}>
      {/* Single left-side floating button stack — 48px buttons, 12px gaps,
          16px from the left edge. Order top→bottom:
          Back → Tools → Add Page → Delete → Mic → AI Chat. */}
      {isTabletPortrait ? (
        // Tablet held vertically: a horizontal top row keeps the controls
        // clear of the status bar and the top of the paper, in the same
        // left-to-right order. Each button keeps its own colors.
        <Box className="nhw-float-row" sx={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', gap: 1, p: 1, bgcolor: 'background.default', opacity: 0.97, zIndex: 100 }}>
          {floatButtons.map((btn, i) => {
            const Comp = btn.comp;
            return (
              <Comp
                key={`nhw-float-${i}`}
                {...btn.props}
                style={{ ...btn.props.style, position: 'fixed', top: 6, left: `calc(16px + ${i} * (48px + 12px))` }}
              />
            );
          })}
        </Box>
      ) : isShortViewport ? (
        // Short viewports: a wrapping bottom strip. flexWrap keeps every
        // control reachable even when the viewport is both short and narrow.
        // Each button keeps its own colors — only position is overridden.
        <Box
          className="nhw-float-row"
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            p: 1,
            bgcolor: 'background.default',
            opacity: 0.97,
            zIndex: 100,
            overflowX: 'auto',
          }}
        >
          {floatButtons.map((btn, i) => {
            const Comp = btn.comp;
            return (
              <Comp
                key={`nhw-float-${i}`}
                {...btn.props}
                style={{ ...btn.props.style, position: 'static', flex: '0 0 auto' }}
              />
            );
          })}
        </Box>
      ) : (
        <div className="nhw-float-stack" data-side="left">
          {floatButtons.map((btn, i) => {
            const Comp = btn.comp;
            return (
              <Comp key={`nhw-float-${i}`} {...btn.props} />
            );
          })}
        </div>
      )}

      {/* Pagination indicator */}
      {paginationVisible && (
        <Box
          ref={paginationRef}
          sx={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: mode === 'dark' ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.95)',
            borderRadius: 2,
            px: 2,
            py: 1,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(8px)',
            zIndex: 200,
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <IconButton size="small" onClick={goToPrevPage} disabled={currentPageIndex === 0} sx={{ color: 'text.primary' }}>
            <ChevronLeft size={20} />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
            {currentPageIndex + 1} / {notebook.pages.length}
          </Typography>
          <IconButton size="small" onClick={goToNextPage} disabled={currentPageIndex >= notebook.pages.length - 1} sx={{ color: 'text.primary' }}>
            <ChevronRight size={20} />
          </IconButton>
        </Box>
      )}

      {/* Canvas Area */}
      {/* Laptop/tall screens: push the paper toward the right edge so it clears
            the left button stack without shrinking. Other layouts stay centered. */}
      <Box
        ref={canvasAreaRef}
        sx={{
          flex: 1,
          display: 'flex',
          justifyContent: isTabletPortrait ? 'flex-start'
            : (!isTabletPortrait && !isShortViewport) ? 'flex-end' : 'center',
          alignItems: isTabletPortrait ? 'flex-start' : 'center',
          py: canvasPadSide,
          pt: canvasPadTop,
          pl: canvasLeftPad,
          pr: (!isTabletPortrait && !isShortViewport) ? '16px' : undefined,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: mode === 'dark' ? '#1e293b' : '#fff',
            position: 'relative',
            width: isLandscape && pageMaxWidth > 0 ? `${pageMaxWidth}px` : '100%',
            maxWidth: isLandscape && pageMaxWidth > 0 ? `${pageMaxWidth}px`
              : isTabletPortrait ? '100vw'
                : { xs: '98vw', sm: '94vw', md: '800px' },
            height: isTabletPortrait ? '100%'
              : isLandscape && pageMaxHeight > 0 ? `${pageMaxHeight}px`
                : undefined,
            maxHeight: isLandscape && pageMaxHeight > 0 ? `${pageMaxHeight}px` : paperMaxHeight,
            aspectRatio: isLandscape ? `${landscapeRatioNum} / 1`
              : isTabletPortrait ? 'auto'
                : '4 / 5',
          }}
        >
          <canvas
            ref={canvasRef}
            className="nohome-editor-canvas"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
          />
        </Box>
      </Box>

      {/* AI chat drawer */}
      <Drawer
        anchor="right"
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        PaperProps={{
          sx: {
            width: '100%',
            maxWidth: { xs: '100%', sm: 420 },
            height: '100vh',
            maxHeight: '100vh',
            bgcolor: 'background.paper',
            color: 'text.primary',
            borderLeft: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
        slotProps={{ backdrop: { sx: { backdropFilter: 'blur(2px)' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Bot size={18} />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>AI Assistant</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Ask anything about your notes</Typography>
            </Box>
          </Box>
          <Tooltip title="Close">
            <IconButton size="small" onClick={() => setChatOpen(false)}>
              <X size={18} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'background.default' }}>
          {chatMessages.length === 0 && (
            <Box sx={{ margin: 'auto', textAlign: 'center', color: 'text.secondary', p: 2 }}>
              <Box sx={{ fontSize: 32, opacity: 0.5, mb: 1 }}>💬</Box>
              <Typography variant="body2">Start a conversation</Typography>
              <Typography variant="caption">Ask a question, request a summary, or get help with your notes.</Typography>
            </Box>
          )}
          {chatMessages.map((msg, idx) => (
            <Box
              key={idx}
              sx={{
                maxWidth: '85%',
                p: 1.2,
                borderRadius: 2,
                bgcolor: msg.role === 'user' ? '#2563eb' : 'background.paper',
                color: msg.role === 'user' ? '#fff' : 'text.primary',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            >
              {msg.content}
            </Box>
          ))}
          {isSending && (
            <Box sx={{ maxWidth: '85%', p: 1.2, borderRadius: 2, bgcolor: 'background.paper', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', color: 'text.secondary', fontSize: '14px' }}>
              AI is thinking…
            </Box>
          )}
          {chatError && (
            <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: '13px' }}>
              {chatError}
            </Box>
          )}
        </Box>
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <Box sx={{ flex: 1 }}>
            <TextField
              multiline
              maxRows={4}
              size="small"
              placeholder="Type a message…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              inputProps={{ 'aria-label': 'Chat message' }}
            />
          </Box>
          <Tooltip title="Send">
            <IconButton
              color="primary"
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isSending}
              sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#1d4ed8' }, '&.Mui-disabled': { bgcolor: 'action.disabled', color: '#fff' } }}
            >
              <Send size={18} />
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      {/* Tool & Settings Dialog */}
      <Dialog
        open={toolDialogOpen}
        onClose={() => setToolDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: mode === 'dark' ? '#1e293b' : '#ffffff',
            color: 'text.primary',
          }
        }}
      >
        <DialogTitle sx={{ pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Tools & Settings</Typography>
          <IconButton size="small" onClick={() => setToolDialogOpen(false)}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {/* Tools Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>Tool</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {([
                { key: 'pen' as Tool, icon: <PenTool size={20} />, label: 'Pen' },
                { key: 'highlighter' as Tool, icon: <Highlighter size={20} />, label: 'Highlighter' },
                { key: 'eraser' as Tool, icon: <Eraser size={20} />, label: 'Eraser' },
              ]).map(({ key, icon, label }) => (
                <IconButton
                  key={key}
                  onClick={() => setTool(key)}
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 2,
                    // Tablet/mobile: black icons on a light background.
                    // Laptop: blue accent with white icons.
                    bgcolor: isTabletMobile
                      ? (tool === key ? '#1e293b' : 'action.hover')
                      : (tool === key ? '#2563eb' : 'action.hover'),
                    color: isTabletMobile
                      ? (tool === key ? '#ffffff' : '#1e293b')
                      : (tool === key ? '#fff' : 'text.primary'),
                    '&:hover': {
                      bgcolor: isTabletMobile
                        ? (tool === key ? '#0f172a' : 'action.selected')
                        : (tool === key ? '#1d4ed8' : 'action.selected')
                    }
                  }}
                >
                  {icon}
                </IconButton>
              ))}
            </Box>
          </Box>

          {/* Size Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>
              Size: {width}
            </Typography>
            <Slider
              value={width}
              min={1}
              max={12}
              onChange={(_, val) => setWidth(val as number)}
              sx={{ color: '#2563eb', '& .MuiSlider-thumb': { width: 16, height: 16 } }}
            />
          </Box>

          {/* Colors Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>Colors</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESET_COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => setColor(c)}
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    bgcolor: c,
                    cursor: 'pointer',
                    border: color === c ? '3px solid #2563eb' : '3px solid transparent',
                    transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                    boxShadow: color === c ? '0 2px 8px rgba(37,99,235,0.3)' : 'none'
                  }}
                />
              ))}
              <Tooltip title="Color palette" placement="top">
                <Box
                  sx={{
                    position: 'relative',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    outline: 'none',
                    overflow: 'hidden',
                    border: '2px solid rgba(0,0,0,0.1)',
                    '&:focus-visible': {
                      boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.5)'
                    }
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 36 36" style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id="rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ff0000" />
                        <stop offset="14%" stopColor="#ff8800" />
                        <stop offset="28%" stopColor="#ffff00" />
                        <stop offset="42%" stopColor="#00ff00" />
                        <stop offset="57%" stopColor="#00ffff" />
                        <stop offset="71%" stopColor="#0000ff" />
                        <stop offset="85%" stopColor="#8800ff" />
                        <stop offset="100%" stopColor="#ff00ff" />
                      </linearGradient>
                    </defs>
                    <circle cx="18" cy="18" r="16" fill="url(#rainbow)" />
                  </svg>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    aria-label="Custom color palette"
                    tabIndex={0}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer',
                      margin: 0,
                      padding: 0
                    }}
                  />
                </Box>
              </Tooltip>
            </Box>
          </Box>

          {/* Paper Type Section */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>Paper Type</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {([
                { key: 'blank' as Template, label: 'Blank' },
                { key: 'ruled' as Template, label: 'Ruled' },
                { key: 'grid' as Template, label: 'Grid' },
                { key: 'dotted' as Template, label: 'Dotted' },
              ]).map(({ key, label }) => (
                <Button
                  key={key}
                  variant={template === key ? 'contained' : 'outlined'}
                  onClick={() => handleChangeTemplate(key)}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    px: 2,
                    bgcolor: template === key ? '#2563eb' : 'transparent',
                    color: template === key ? '#fff' : 'text.primary',
                    borderColor: template === key ? '#2563eb' : 'divider',
                    '&:hover': {
                      bgcolor: template === key ? '#1d4ed8' : 'action.hover',
                      borderColor: template === key ? '#1d4ed8' : 'divider'
                    }
                  }}
                >
                  {label}
                </Button>
              ))}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </Box>
  );
};

export default EditorView;
