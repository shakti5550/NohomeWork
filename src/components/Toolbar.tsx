import React, {useState} from 'react'
import {
  Box, Button, Select, MenuItem, Input, IconButton,
  Tooltip, Slider, Typography
} from '@mui/material'
import {Undo, Redo, PenTool, Highlighter, Eraser, Text, Image, ZoomIn, ZoomOut} from '@mui/icons-material'

const Toolbar: React.FC<{
  notebookId: string
  onTemplateChange: (template: string) => void
  onPageAdd: () => void
  onPageDelete: (pageId: string) => void
  templates: string[]
  activeTemplate: string
}> = ({
  notebookId,
  onTemplateChange,
  onPageAdd,
  onPageDelete,
  templates,
  activeTemplate
}) => {
  const [strokeColor, setStrokeColor] = useState('#000')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'text' | 'shape'>('pen')

  return (
    <Box sx={{padding: 1, background: '#f7f7f7', borderBottom: '1px solid #e0e0e0'}}>
      <Box sx={{display: 'flex', gap: 1, alignItems: 'center'}}>
        {/* Template Selector */}
        <Select
          labelId="template-label"
          label="Template"
          value={activeTemplate}
          onChange={(e) => onTemplateChange(e.target.value)}
          sx={{minWidth: 120}}
        >
          {templates.map((template) => (
            <MenuItem key={template} value={template}>
              {template}
            </MenuItem>
          ))}
        </Select>

        {/* Tool Buttons */}
        <Box sx={{display: 'flex', gap: 2}}>
          <Tooltip title="Pen">
            <IconButton onClick={() => setTool('pen')} sx={{p: 1}}>
              <PenTool />
            </IconButton>
          </Tooltip>
          <Tooltip title="Highlighter">
            <IconButton onClick={() => setTool('highlighter')} sx={{p: 1}}>
              <Highlighter />
            </IconButton>
          </Tooltip>
          <Tooltip title="Eraser">
            <IconButton onClick={() => setTool('eraser')} sx={{p: 1}}>
              {<Image />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Color Picker */}
        <Tooltip title="Color">
          <Input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            sx={{p: 1, width: 30}}
          />
        </Tooltip>

        {/* Width Slider */}
        <Typography variant="caption" color="text.secondary">
          Width: {strokeWidth}
        </Typography>
        <Slider
          value={strokeWidth}
          min={1}
          max={10}
          onChange={(e) => setStrokeWidth(e.target.value as number)}
          sx={{sx: {width: 100}}}
        />

        {/* Action Buttons */}
        <Box sx={{display: 'flex', gap: 8, marginLeft: 'auto'}}>
          <Button variant="outlined" onClick={onPageAdd}>+ Page</Button>
          <Button variant="outlined" onClick={() => onPageDelete(notebookId, '')}>
            - Page
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

export default Toolbar