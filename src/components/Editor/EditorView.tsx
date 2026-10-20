import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, IconButton, Typography, Select, MenuItem, Slider, Tooltip, Divider, Button
} from '@mui/material';
import {
  ArrowLeft, PenTool, Highlighter, Eraser, Plus, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Notebook, Page, Stroke, saveNotebook } from '../../storage/cloud';
import { useThemeMode } from '../../ThemeContext';

interface EditorViewProps {
  notebook: Notebook;
  onBack: () => void;
  onUpdateNotebook: (updated: Notebook) => void;
}

export const EditorView: React.FC<EditorViewProps> = ({ notebook, onBack, onUpdateNotebook }) => {
  const { mode } = useThemeMode();
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(3);

  // Drawing state lives in refs so pointer handlers never go stale and a
  // stroke commit does NOT trigger a React re-render (that was what made
  // fast writing drop strokes — every lift caused a full redraw + IndexedDB
  // write that blocked the next touch-down).
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentPage: Page = notebook.pages[currentPageIndex] || notebook.pages[0];

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
  useEffect(() => {
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

    if (isDrawingRef.current) return; // live stroke owns the canvas right now

    currentPage.strokes.forEach((stroke) => drawStroke(ctx, stroke));
  }, [currentPage]);

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
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', p: { xs: 0.5, sm: 1, md: 4 }, overflow: 'auto', pb: { xs: 2, sm: 4 } }}>
        <Box
          sx={{
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: mode === 'dark' ? '#1e293b' : '#fff',
            position: 'relative',
            width: '100%',
            maxWidth: { xs: '98vw', sm: '94vw', md: '800px' },
            maxHeight: { xs: '82vh', sm: '88vh', md: 'none' },
            aspectRatio: '4 / 5',
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
    </Box>
  );
};