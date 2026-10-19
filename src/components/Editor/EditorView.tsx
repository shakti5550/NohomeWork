import React, { useRef, useState, useEffect } from 'react';
import {
  Box, IconButton, Typography, Select, MenuItem, Slider, Tooltip, Divider, Button
} from '@mui/material';
import {
  ArrowLeft, Undo, Redo, PenTool, Highlighter, Eraser, Plus, Trash2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Save
} from 'lucide-react';
import { Notebook, Page, Stroke, saveNotebook } from '../../storage/db';
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
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentPage: Page = notebook.pages[currentPageIndex] || notebook.pages[0];

  // Save current notebook changes
  const updateCurrentNotebook = (newPages: Page[]) => {
    const updated: Notebook = {
      ...notebook,
      pages: newPages,
      updatedAt: Date.now()
    };
    onUpdateNotebook(updated);
    saveNotebook(updated);
  };

  // Redraw canvas whenever page or strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw Template Background
    drawTemplate(ctx, rect.width, rect.height, currentPage.template);

    // Draw all strokes
    currentPage.strokes.forEach((stroke) => {
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
    });
  }, [currentPage, notebook]);

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

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'eraser') {
      eraseStrokeAt(x, y);
      return;
    }

    setIsDrawing(true);
    const newStroke: Stroke = {
      id: 'st_' + Math.random().toString(36).substring(2, 9),
      tool,
      color,
      width: tool === 'highlighter' ? width * 4 : width,
      opacity: tool === 'highlighter' ? 0.4 : 1.0,
      points: [{ x, y }]
    };
    setCurrentStroke(newStroke);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStroke) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const updatedPoints = [...currentStroke.points, { x, y }];
    setCurrentStroke({ ...currentStroke, points: updatedPoints });

    // Live preview render
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth = currentStroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = currentStroke.opacity;
    if (currentStroke.tool === 'highlighter') ctx.globalCompositeOperation = 'multiply';

    const pts = currentStroke.points;
    const lastPt = pts[pts.length - 1];
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  };

  const stopDrawing = () => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);

    const updatedStrokes = [...currentPage.strokes, currentStroke];
    const updatedPages = [...notebook.pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      strokes: updatedStrokes
    };

    updateCurrentNotebook(updatedPages);
    setCurrentStroke(null);
  };

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
    updateCurrentNotebook(updatedPages);
    setCurrentPageIndex(updatedPages.length - 1);
  };

  const handleDeletePage = () => {
    if (notebook.pages.length <= 1) {
      alert('A notebook must have at least one page.');
      return;
    }
    const updatedPages = notebook.pages.filter((_, idx) => idx !== currentPageIndex);
    updateCurrentNotebook(updatedPages);
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
  };

  const handleTemplateChange = (template: any) => {
    const updatedPages = [...notebook.pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      template
    };
    updateCurrentNotebook(updatedPages);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      {/* Top Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', gap: 2, zIndex: 10 }}>
        <Tooltip title="Back to Library">
          <IconButton onClick={onBack} color="inherit">
            <ArrowLeft size={20} />
          </IconButton>
        </Tooltip>

        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '16px', color: 'text.primary', mr: 2 }}>
          {notebook.title}
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

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

        <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

        {/* Width Slider */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 140 }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>Size</Typography>
          <Slider
            size="small"
            value={width}
            min={1}
            max={12}
            onChange={(_, val) => setWidth(val as number)}
            sx={{ color: '#2563eb' }}
          />
        </Box>

        <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

        {/* Template Selector */}
        <Select
          size="small"
          value={currentPage.template}
          onChange={(e) => handleTemplateChange(e.target.value)}
          sx={{ fontSize: '13px', borderRadius: 2, bgcolor: 'background.paper' }}
        >
          <MenuItem value="ruled">Ruled Paper</MenuItem>
          <MenuItem value="grid">Grid Paper</MenuItem>
          <MenuItem value="dotted">Dotted Paper</MenuItem>
          <MenuItem value="blank">Blank Paper</MenuItem>
        </Select>

        {/* Page Navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          <IconButton
            size="small"
            disabled={currentPageIndex === 0}
            onClick={() => setCurrentPageIndex(currentPageIndex - 1)}
            color="inherit"
          >
            <ChevronLeft size={18} />
          </IconButton>          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {currentPageIndex + 1} / {notebook.pages.length}
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
            sx={{ textTransform: 'none', borderRadius: 2, ml: 1 }}
          >
            Page
          </Button>
          <IconButton size="small" onClick={handleDeletePage} sx={{ color: '#ef4444' }}>
            <Trash2 size={16} />
          </IconButton>
        </Box>
      </Box>

      {/* Canvas Area */}
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', p: { xs: 1, md: 4 }, overflow: 'auto' }}>
        <Box
          sx={{
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: mode === 'dark' ? '#1e293b' : '#fff',
            position: 'relative',
            width: '100%',
            maxWidth: { xs: '96vw', sm: '90vw', md: '800px' },
            maxHeight: { xs: '70vh', sm: '80vh', md: 'none' },
            aspectRatio: '4 / 5',
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        </Box>
      </Box>
    </Box>
  );
};
