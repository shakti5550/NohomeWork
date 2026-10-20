import { supabase, isSupabaseConfigured } from './supabaseClient';

// ─── Domain types (previously in db.ts) ───────────────────────────────────
export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
}

export interface Page {
  id: string;
  pageNumber: number;
  template: 'blank' | 'ruled' | 'dotted' | 'grid';
  strokes: Stroke[];
  backgroundPdfUrl?: string;
}

export interface Notebook {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  coverColor: string;
  coverStyle: 'minimal' | 'classic' | 'grid';
  pages: Page[];
}

// ─── Cloud storage — Supabase is the single source of truth ─────────────
// All notebook/page data lives in Supabase so it syncs across devices
// whenever the user signs in. No IndexedDB involved.

function ensureSignedIn() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  }
}

// ─── Read ────────────────────────────────────────────────────────────────

export async function getAllNotebooks(): Promise<Notebook[]> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: nbRows, error: nbErr } = await supabase
    .from('notebooks')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (nbErr || !nbRows || nbRows.length === 0) return [];

  // Fetch every page for these notebooks in a single query
  const ids = nbRows.map((r) => r.id);
  const { data: pageRows } = await supabase
    .from('pages')
    .select('*')
    .in('notebook_id', ids)
    .order('page_number', { ascending: true });

  const pagesByNotebook = new Map<string, any[]>();
  for (const p of pageRows ?? []) {
    const arr = pagesByNotebook.get(p.notebook_id) ?? [];
    arr.push(p);
    pagesByNotebook.set(p.notebook_id, arr);
  }

  return nbRows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    coverColor: row.cover_color,
    coverStyle: row.cover_style as Notebook['coverStyle'],
    pages: (pagesByNotebook.get(row.id) ?? []).map((p) => ({
      id: p.id,
      pageNumber: p.page_number,
      template: p.template as Page['template'],
      strokes: p.strokes ?? [],
    })),
  }));
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;

  const { data: row, error } = await supabase
    .from('notebooks')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !row) return undefined;
  if (row.user_id !== user.id) return undefined; // not ours

  const { data: pageRows } = await supabase
    .from('pages')
    .select('*')
    .eq('notebook_id', id)
    .order('page_number', { ascending: true });

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    coverColor: row.cover_color,
    coverStyle: row.cover_style as Notebook['coverStyle'],
    pages: (pageRows ?? []).map((p) => ({
      id: p.id,
      pageNumber: p.page_number,
      template: p.template as Page['template'],
      strokes: p.strokes ?? [],
    })),
  };
}

// ─── Write ───────────────────────────────────────────────────────────────

export async function saveNotebook(notebook: Notebook): Promise<void> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error: nbErr } = await supabase.from('notebooks').upsert({
    id: notebook.id,
    user_id: user.id,
    title: notebook.title,
    cover_color: notebook.coverColor,
    cover_style: notebook.coverStyle,
    created_at: notebook.createdAt,
    updated_at: notebook.updatedAt,
  });
  if (nbErr) throw nbErr;

  // Upsert each page (strokes stored as JSONB)
  for (const page of notebook.pages) {
    const { error: pErr } = await supabase.from('pages').upsert({
      id: page.id,
      notebook_id: notebook.id,
      page_number: page.pageNumber,
      template: page.template,
      strokes: page.strokes,
      updated_at: Date.now(),
    });
    if (pErr) throw pErr;
  }
}

export async function deleteNotebook(id: string): Promise<void> {
  ensureSignedIn();
  // Pages are deleted automatically via ON DELETE CASCADE in the schema
  const { error } = await supabase.from('notebooks').delete().eq('id', id);
  if (error) throw error;
}

export async function createDefaultNotebook(title: string = 'Untitled Notebook'): Promise<Notebook> {
  const newNotebook: Notebook = {
    id: 'nb_' + Math.random().toString(36).substring(2, 9),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    coverColor: '#1976d2',
    coverStyle: 'classic',
    pages: [
      {
        id: 'pg_' + Math.random().toString(36).substring(2, 9),
        pageNumber: 1,
        template: 'ruled',
        strokes: [],
      },
    ],
  };
  await saveNotebook(newNotebook);
  return newNotebook;
}