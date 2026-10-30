import React from 'react';
import { Card, Box, Typography, IconButton } from '@mui/material';
import { MoreVertical } from 'lucide-react';
import { Notebook } from '../storage/cloud';

/**
 * A single notebook cover tile, shared by the Documents grid, the Favorites
 * page and any other place that lists notebooks. Renders the cover color as
 * the card background with the title, page count and date, plus the ⋮
 * options button. The parent decides what happens on click / menu-open.
 */
interface NotebookTileProps {
  nb: Notebook;
  onOpen: (id: string, returnTo?: string) => void;
  onMenuOpen: (e: React.MouseEvent<HTMLElement>, id: string) => void;
  /** The notebook id currently having its menu open, for aria-expanded. */
  menuActiveId: string | null;
  /** Route to return to when the editor's Back button is pressed. */
  returnTo?: string;
}

export const NotebookTile: React.FC<NotebookTileProps> = ({
  nb,
  onOpen,
  onMenuOpen,
  menuActiveId,
  returnTo,
}) => {
  return (
    <Card
      sx={{
        borderRadius: 3,
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 240, md: 280 },
        bgcolor: nb.coverColor,
        color: '#fff',
        position: 'relative',
      }}
      onClick={() => onOpen(nb.id, returnTo)}
    >
      <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="subtitle2" sx={{ opacity: 0.8, textTransform: 'uppercase', fontSize: '10px', letterSpacing: 1 }}>
            Notebook
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 1, lineHeight: 1.2, wordBreak: 'break-word', fontSize: { xs: '16px', md: '20px' } }}>
            {nb.title}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, mt: 'auto' }}>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            {nb.pages.length} pages
          </Typography>
          <IconButton
            size="small"
            onClick={(e) => onMenuOpen(e, nb.id)}
            aria-label="Notebook options"
            aria-controls={menuActiveId === nb.id ? 'notebook-menu' : undefined}
            aria-expanded={menuActiveId === nb.id}
            sx={{ color: '#fff', opacity: 0.7, '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.2)' } }}
          >
            <MoreVertical size={16} />
          </IconButton>
        </Box>
      </Box>
    </Card>
  );
};