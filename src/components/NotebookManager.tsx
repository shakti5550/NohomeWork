import React, {useState} from 'react'
import {
  Box, Card, Typography, Button, Input, Select, MenuItem,
  Avatar, Chip, Divider
} from '@mui/material'

type Notebook = {
  id: string
  title: string
  pages: number
  template: string
}

const NotebookManager: React.FC<{
  notebooks: Notebook[]
  activeNotebookId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
  isRenaming: string | null
  setIsRenaming: React.Dispatch<React.SetStateAction<string | null>>
  renameName: string
  setRenameName: React.Dispatch<React.SetStateAction<string>>
}> = ({
  notebooks,
  activeNotebookId,
  onSelect,
  onRename,
  onDelete,
  isRenaming,
  setIsRenaming,
  renameName,
  setRenameName
}) => {
  const handleRename = (id: string, event: any) => {
    const newTitle = event.target.value
    setRenameName(newTitle)
    setIsRenaming(id)
  }

  const confirmRename = () => {
    if (renameName.trim()) {
      onRename(isRenaming || '', renameName)
    }
    setIsRenaming(null)
    setRenameName('')
  }

  return (
    <Box sx={{width: 280, p: 1, height: '100vh', background: '#fff', borderRight: '1px solid #e0e0e0'}}>
      <Avatar sx={{my: 2, margin: 'auto'}}>
        {activeNotebookId ? (activeNotebookId.substring(0, 2).toUpperCase()) : 'NH'}
      </Avatar>

      <Typography variant="h6" sx={{textAlign: 'center', mb: 2}}>Notebooks</Typography>
      <Divider orientation="vertical" sx={{my: 1}} />

      {notebooks.map((notebook) => (
        <Card
          key={notebook.id}
          sx={{
            margin: 1,
            border: activeNotebookId === notebook.id ? '2px solid #1976d2' : '1px solid #e0e0e0',
            borderRadius: 4,
            overflow: 'hidden',
            '&:hover': {borderColor: '#e0e0e0'},
          }}
          onClick={() => onSelect(notebook.id)}
        >
          <Box sx={{p: 1, display: 'flex', alignItems: 'center'}}>
            <Typography variant="subtitle1" fontWeight={500}>
              {notebook.title}
            </Typography>
            <Typography variant="body2" sx={{ml: 1, color: '#666'}}>
              {notebook.pages} pages
            </Typography>
          </Box>
          {isRenaming === notebook.id && (
            <Box sx={{p: 1}}>
              <Input
                defaultValue={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                sx={{width: '100%'}}
              />
              <Button size="small" onClick={confirmRename}>Done</Button>
            </Box>
          )}
        </Card>
      ))}

      <Divider orientation="vertical" sx={{my: 1}} />

      <Card sx={{p: 1}}>
        <Button variant="outlined" onClick={() => onSelect(null)}>
          + New Notebook
        </Button>
      </Card>
    </Box>
  )
}

export default NotebookManager