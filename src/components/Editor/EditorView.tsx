import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, IconButton, Typography, Select, MenuItem, Slider, Tooltip, Divider, Button, Drawer, TextField, useMediaQuery
} from '@mui/material';
import {
  ArrowLeft, PenTool, Highlighter, Eraser, Plus, Trash2, ChevronLeft, ChevronRight, Bot, X, Send
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

export const EditorView: React.FC<EditorViewProps> = ({ notebook, onBack, onUpdateNotebook }) => {
  const { mode } = useThemeMode();
  const isLandscape = useMediaQuery('(orientation: landscape)');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(3);

  // Track the last pointer position so dictation knows where to place text.
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // AI chat — floating button + right-side drawer.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(notebook.aiChat ?? []);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Drawing state lives in refs so pointer handlers never go stale and a
  // stroke commit does NOT trigger a React re-render (that was what made
  // fast writing drop strokes — every lift caused a full redraw + IndexedDB
  // write that blocked the next touch-down).
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const currentPage: Page = notebook.pages[currentPageIndex] || notebook.pages[0];

  // Measure the canvas area's *real* available size (after the toolbar
  // shrinks the viewport) so the page cap is anchored to what actually fits
  // rather than the full window height — otherwise the bottom of the page
  // would be clipped and unreachable.
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
      console.log('[Editor] canvas avail w:', Math.round(availW), 'h:', Math.round(availH),
        'padH:', Math.round(padH), 'padV:', Math.round(padV),
        'viewport w:', Math.round(window.innerWidth), 'h:', Math.round(window.innerHeight));
      console.log('[Editor] canvas avail w:', Math.round(availW), 'h:', Math.round(availH),
        'padH:', Math.round(padH), 'padV:', Math.round(padV),
        'viewport w:', Math.round(window.innerWidth), 'h:', Math.round(window.innerHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Available height/width inside the canvas area (after padding).
  // Note: canvasAreaSize already has padding subtracted, so availHeight/Width are the true free space.
  const availHeight = canvasAreaSize.height;
  const availWidth = Math.max(0, canvasAreaSize.width);

  // In landscape, cap the page against the available height and derive the
  // width from that cap so the 5/4 ratio is preserved. (CSS aspect-ratio
  // only supplies a preferred size — it does not override a conflicting
  // maxHeight, which would otherwise squash the page off-ratio.)
  const pageMaxHeight = isLandscape ? Math.max(0, availHeight) : 0;
  const pageMaxWidth = isLandscape && pageMaxHeight > 0
    ? Math.min(availWidth, pageMaxHeight * (5 / 4))
    : 0;
  console.log('[Editor] isLandscape:', isLandscape, 'pageMaxHeight:', pageMaxHeight, 'pageMaxWidth:', pageMaxWidth, 'availHeight:', availHeight, 'availWidth:', availWidth);

  // Latest values for use inside long-lived callbacks / timers.
  const notebookRef = useRef(notebook);
  notebookRef.current = notebook;
  const pageIndexRef = useRef(currentPageIndex);
  pageIndexRef.current = currentPageIndex;
  const saveTimerRef = useRef<number | null>(null);

  // Commit page changes to React state immediately (cheap) but debounce the
  // IndexedDB write so rapid strokes don't queue up dozens of saves/redraws.
  const updateCurrentNotebook = useCallback((newPages: Page[], persistDelay = 400) => {
    const updated: Notebook = {
      ...notebookRef.current,
      pages: newPages,
      updatedAt: Date.now()
    };
    onUpdateNotebook(updated);

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveNotebook(updated);
    }, persistDelay);
  }, [onUpdateNotebook]);

  // Flush any pending save when leaving the editor.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        saveNotebook(notebookRef.current);
      }
    };
  }, []);

  // ─── AI chat ─────────────────────────────────────────────────────────────
  // Sends a message to the best available provider (Gemini → OpenRouter →
  // NVIDIA, with automatic fallback). The conversation is persisted on the
  // notebook via the existing save flow so it syncs to the cloud.

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
      const { response, provider } = await sendMessage(text, chatMessages);
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

  const drawTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number, template: string) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    if (template === 'ruled') {
      const lineHeight = 32;
      for (let y = 60; y < height; y += lineHeight) {
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(width - 40, y);
        ctx.stroke();
      }
      // Margin line
      ctx.strokeStyle = '#fca5a5';
      ctx.beginPath();
      ctx.moveTo(80, 0);
      ctx.lineTo(80, height);
      ctx.stroke();
    } else if (template === 'grid') {
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
    } else if (template === 'dotted') {
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
    // Preserve explicit line breaks from the transcript.
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
      // A single word wider than the max width: fall back to char breaking.
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

    const rightMargin = 24;
    const maxWidth = canvasWidth - ann.x - rightMargin;
    if (maxWidth <= 0 || canvasHeight <= 0) {
      ctx.restore();
      return;
    }

    // Three strategies, tried in order, so a tall block is never silently
    // clipped off the bottom of the page:
    //   1. Render at the requested size if the whole block fits.
    //   2. Shift the block up within the page if it still fits vertically.
    //   3. Shrink the font until the block fits (down to a floor) — this is
    //      the only way to show a block taller than the canvas itself.
    const MIN_FONT = 10;
    const LINE_HEIGHT_RATIO = 1.4;

    let fontSize = ann.fontSize;
    let lines = wrapText(ctx, ann.text, maxWidth, fontSize, ann.font);
    let lineHeight = fontSize * LINE_HEIGHT_RATIO;
    let blockHeight = lines.length * lineHeight;

    if (blockHeight > canvasHeight) {
      // Block is taller than the page — scale the font down until it fits.
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

    // Vertically fit the block inside the page: prefer the original y, but
    // slide it up if it would run off the bottom.
    let startY = ann.y;
    if (startY + blockHeight > canvasHeight) {
      startY = Math.max(0, canvasHeight - blockHeight - 8);
    }

    ctx.font = `${fontSize}px ${ann.font}`;
    ctx.fillStyle = ann.color;
    lines.forEach((line, i) => ctx.fillText(line, ann.x, startY + i * lineHeight));
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

  // Size the backing store once per resize; only repaint strokes when the
  // committed page data changes — never while a stroke is in progress, so
  // the live ink isn't wiped mid-motion and the main thread stays free for
  // incoming pointer events.
  //
  // `canvasAreaHeight`/`isLandscape` are in the deps so a measured height
  // change (page resize) re-sizes the backing store. A CSS-sized canvas
  // otherwise scales its existing buffer instead of resizing it, which
  // misaligns existing ink and offsets a live stroke from the pointer.
  useEffect(() => {
    // Bail out before touching the bitmap while a stroke is in flight —
    // resizing/clearing now would wipe the live ink mid-motion.
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
    drawTemplate(ctx, rect.width, rect.height, currentPage.template);

    currentPage.strokes.forEach((stroke) => drawStroke(ctx, stroke));
    (currentPage.textAnnotations ?? []).forEach((ann) => drawTextAnnotation(ctx, ann, rect.width, rect.height));
  }, [currentPage, pageMaxHeight, pageMaxWidth, isLandscape]);

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

    // A stray pointerdown while a stroke is somehow still open: close it first.
    if (isDrawingRef.current) stopDrawing();

    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture may fail in some browsers; drawing still works.
    }

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
    const newStroke: Stroke = {
      id: 'st_' + Math.random().toString(36).substring(2, 9),
      tool,
      color,
      width: tool === 'highlighter' ? width * 4 : width,
      opacity: tool === 'highlighter' ? 0.4 : 1.0,
      points: [{ x, y }]
    };
    currentStrokeRef.current = newStroke;
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

    // Incremental render: draw only the newest segment onto the existing
    // bitmap. No clearing, no re-render, no React state update.
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

  // Catch lifts/cancels anywhere on the page (finger drifting off-canvas,
  // palm rejection, system gestures) so drawing state always resets cleanly.
  useEffect(() => {
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [handleWindowPointerEnd]);

  const eraseStrokeAt = (x: number, y: number) => {
    // Simple radius eraser
    const radius = 15;
    const filteredStrokes = currentPage.strokes.filter((stroke) => {
      return !stroke.points.some((pt) => Math.hypot(pt.x - x, pt.y - y) < radius);
    });

    if (filteredStrokes.length !== currentPage.strokes.length) {
      const updatedPages = [...notebook.pages];
      updatedPages[currentPageIndex] = {
        ...currentPage,
        strokes: filteredStrokes
      };
      updateCurrentNotebook(updatedPages);
    }
  };

  const handleDictate = (text: string, x: number, y: number) => {
    const ann: TextAnnotation = {
      id: 'ta_' + Math.random().toString(36).substring(2, 9),
      x, y,
      text,
      font: 'system-ui',
      fontSize: width * 5 + 8, // scale font with brush size (8–68px)
      color,
      createdAt: Date.now(),
    };
    const nb = notebookRef.current;
    const idx = pageIndexRef.current;
    const page = nb.pages[idx];
    const updatedPages = [...nb.pages];
    updatedPages[idx] = {
      ...page,
      textAnnotations: [...(page.textAnnotations ?? []), ann],
    };
    updateCurrentNotebook(updatedPages);
  };

  const handleAddPage = () => {
    const newPage: Page = {
      id: 'pg_' + Math.random().toString(36).substring(2, 9),
      pageNumber: notebook.pages.length + 1,
      template: currentPage.template,
      strokes: []
    };
    const updatedPages = [...notebook.pages, newPage];
    updateCurrentNotebook(updatedPages, 0);
    setCurrentPageIndex(updatedPages.length - 1);
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

  const handleTemplateChange = (template: any) => {
    const updatedPages = [...notebook.pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      template
    };
    updateCurrentNotebook(updatedPages, 0);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      {/* Floating dictation button — bottom-right, just above the AI chat button */}
      <DictationButton onDictate={handleDictate} lastPointerPos={lastPointerPos} />

      {/* Floating AI chat button — bottom-right of the viewport */}
      <ChatButton onClick={() => setChatOpen((o) => !o)} isOpen={chatOpen} />

      {/* Top Toolbar */}
      <Box sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        px: { xs: 1, md: 2 },
        py: 1,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        gap: { xs: 1, md: 2 },
        zIndex: 10,
      }}>
        <Tooltip title="Back to Library">
          <IconButton onClick={onBack} color="inherit" size="small">
            <ArrowLeft size={20} />
          </IconButton>
        </Tooltip>

        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '15px', color: 'text.primary', whiteSpace: 'nowrap' }}>
          {notebook.title}
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ my: 0.5, display: { xs: 'none', sm: 'block' } }} />

        {/* Tools */}
        <Box sx={{ display: 'flex', gap: 0.5, bgcolor: 'action.hover', p: 0.5, borderRadius: 2 }}>
          <Tooltip title="Pen">
            <IconButton
              size="small"
              onClick={() => setTool('pen')}
              sx={{ borderRadius: 1.5, bgcolor: tool === 'pen' ? 'background.paper' : 'transparent', color: tool === 'pen' ? '#2563eb' : 'text.secondary', boxShadow: tool === 'pen' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <PenTool size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Highlighter">
            <IconButton
              size="small"
              onClick={() => setTool('highlighter')}
              sx={{ borderRadius: 1.5, bgcolor: tool === 'highlighter' ? 'background.paper' : 'transparent', color: tool === 'highlighter' ? '#2563eb' : 'text.secondary', boxShadow: tool === 'highlighter' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <Highlighter size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Eraser">
            <IconButton
              size="small"
              onClick={() => setTool('eraser')}
              sx={{ borderRadius: 1.5, bgcolor: tool === 'eraser' ? 'background.paper' : 'transparent', color: tool === 'eraser' ? '#2563eb' : 'text.secondary', boxShadow: tool === 'eraser' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              <Eraser size={18} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Colors */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {['#000000', '#dc2626', '#2563eb', '#16a34a', '#d97706'].map((c) => (
            <Box
              key={c}
              onClick={() => setColor(c)}
              sx={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                bgcolor: c,
                cursor: 'pointer',
                border: color === c ? '2px solid #0f172a' : '2px solid transparent',
                transform: color === c ? 'scale(1.15)' : 'scale(1)',
                transition: 'all 0.1s'
              }}
            />
          ))}
        </Box>

        <Divider orientation="vertical" flexItem sx={{ my: 0.5, display: { xs: 'none', sm: 'block' } }} />

        {/* Width Slider */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: { xs: 80, md: 140 } }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Size</Typography>
          <Slider
            size="small"
            value={width}
            min={1}
            max={12}
            onChange={(_, val) => setWidth(val as number)}
            sx={{ color: '#2563eb' }}
          />
        </Box>

        <Divider orientation="vertical" flexItem sx={{ my: 0.5, display: { xs: 'none', sm: 'block' } }} />

        {/* Template Selector */}
        <Select
          size="small"
          value={currentPage.template}
          onChange={(e) => handleTemplateChange(e.target.value)}
          sx={{ fontSize: '13px', borderRadius: 2, bgcolor: 'background.paper', minWidth: { xs: 110, md: 130 } }}
        >
          <MenuItem value="ruled">Ruled Paper</MenuItem>
          <MenuItem value="grid">Grid Paper</MenuItem>
          <MenuItem value="dotted">Dotted Paper</MenuItem>
          <MenuItem value="blank">Blank Paper</MenuItem>
        </Select>

        {/* Page Navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <IconButton
            size="small"
            disabled={currentPageIndex === 0}
            onClick={() => setCurrentPageIndex(currentPageIndex - 1)}
            color="inherit"
          >
            <ChevronLeft size={18} />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap', minWidth: '36px', textAlign: 'center' }}>
            {currentPageIndex + 1}/{notebook.pages.length}
          </Typography>
          <IconButton
            size="small"
            disabled={currentPageIndex === notebook.pages.length - 1}
            onClick={() => setCurrentPageIndex(currentPageIndex + 1)}
            color="inherit"
          >
            <ChevronRight size={18} />
          </IconButton>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={14} />}
            onClick={handleAddPage}
            sx={{ textTransform: 'none', borderRadius: 2, ml: 0.5, py: 0.5, px: 1 }}
          >
            Page
          </Button>
          <IconButton size="small" onClick={handleDeletePage} sx={{ color: '#ef4444', ml: 0.5 }}>
            <Trash2 size={18} />
          </IconButton>
        </Box>
      </Box>

      {/* Canvas Area */}
      <Box ref={canvasAreaRef} sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', p: { xs: 0.5, sm: 1, md: 4 }, overflow: 'hidden' }}>
        <Box
          sx={{
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: mode === 'dark' ? '#1e293b' : '#fff',
            position: 'relative',
            width: '100%',
            maxWidth: isLandscape && pageMaxWidth > 0
              ? `${pageMaxWidth}px`
              : { xs: '98vw', sm: '94vw', md: '800px' },
            maxHeight: isLandscape && pageMaxHeight > 0
              ? `${pageMaxHeight}px`
              : { xs: '82vh', sm: '88vh', md: 'none' },
            aspectRatio: isLandscape ? '5 / 4' : '4 / 5',
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

      {/* AI chat drawer — slides in from the right over the canvas */}
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
        {/* Drawer header */}
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

        {/* Message list */}
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

        {/* Input row */}
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'flex-end' }}>
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
            sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            inputProps={{ 'aria-label': 'Chat message' }}
          />
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
    </Box>
  );
};