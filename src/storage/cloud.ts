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

/**
 * A piece of text rendered on the page — produced by dictation (speech to
 * text) or typed inline. Positions are stored in canvas CSS pixels so they
 * scale with the backing-store DPR transform.
 */
export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  font: string;       // e.g. 'system-ui'
  fontSize: number;   // CSS px
  color: string;
  createdAt: number;
}

export interface Page {
  id: string;
  pageNumber: number;
  template: 'blank' | 'ruled' | 'dotted' | 'grid';
  strokes: Stroke[];
  textAnnotations?: TextAnnotation[];
  backgroundPdfUrl?: string;
}

export interface Notebook {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  created_date?: string;
  coverColor: string;
  coverStyle: 'minimal' | 'classic' | 'grid';
  pages: Page[];
  version?: number;
  aiChat?: ChatMessage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Cloud storage — Supabase is the single source of truth ─────────────
// All notebook/page data lives in Supabase so it syncs across devices
// whenever the user signs in. No IndexedDB involved.

function ensureSignedIn() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  }
}

// Guards the first-run seeding step so concurrent callers (e.g. React
// StrictMode running the mount effect twice) can't both see an empty
// list and each create a "Welcome" notebook.
const pendingLoads = new Map<string, Promise<Notebook[]>>();

export async function loadNotebooks(): Promise<Notebook[]> {
  // Ensure we have a signed‑in user to scope the pending load
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const key = `${user.id}-notebooks`;
  if (pendingLoads.has(key)) return pendingLoads.get(key)!;

  const loadPromise = (async () => {
    const list = await getAllNotebooks();
    if (list.length === 0) {
      const defaultNb = await createDefaultNotebook('Welcome to NohomeWork');
      return [defaultNb];
    }
    return list;
  })();

  pendingLoads.set(key, loadPromise);
  loadPromise.finally(() => pendingLoads.delete(key));

  return loadPromise;
}

// ─── Read ────────────────────────────────────────────────────────────────

// Fetch pages for one or more notebooks, paginating through the 1,000‑row
// default query limit so we never silently drop pages from a notebook.
async function fetchAllPages(notebookIds: string[]): Promise<Map<string, any[]>> {
  const PAGE_SIZE = 1000;
  const pagesByNotebook = new Map<string, any[]>();
  for (const notebookId of notebookIds) {
    const all: any[] = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('notebook_id', notebookId)
        .order('page_number', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    pagesByNotebook.set(notebookId, all);
  }
  return pagesByNotebook;
}

export async function getAllNotebooks(): Promise<Notebook[]> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: nbRows, error: nbErr } = await supabase
    .from('notebooks')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (nbErr) throw nbErr;
  if (!nbRows || nbRows.length === 0) return [];

  // Fetch every page for these notebooks, paginating past the 1,000‑row
  // default query limit so we never silently drop pages.
  const ids = nbRows.map((r) => r.id);
  const pagesByNotebook = await fetchAllPages(ids);

  return nbRows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    created_date: row.created_date,
    coverColor: row.cover_color,
    coverStyle: row.cover_style as Notebook['coverStyle'],
    version: row.version,
    aiChat: row.ai_chat ?? [],
    pages: (pagesByNotebook.get(row.id) ?? []).map((p) => ({
      id: p.id,
      pageNumber: p.page_number,
      template: p.template as Page['template'],
      strokes: p.strokes ?? [],
      textAnnotations: p.text_annotations ?? [],
      backgroundPdfUrl: p.background_pdf_url,
    })),
  }));
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;

  // Use maybeSingle so a missing notebook (or one hidden by RLS) returns
  // undefined instead of throwing a "no rows" error.
  const { data: row, error: nbErr } = await supabase
    .from('notebooks')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (nbErr) throw nbErr;
  if (!row) return undefined;
  if (row.user_id !== user.id) return undefined; // not ours

  const pagesByNotebook = await fetchAllPages([id]);
  const pageRows = pagesByNotebook.get(id) ?? [];

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    created_date: row.created_date,
    coverColor: row.cover_color,
    coverStyle: row.cover_style as Notebook['coverStyle'],
    version: row.version,
    aiChat: row.ai_chat ?? [],
    pages: pageRows.map((p) => ({
      id: p.id,
      pageNumber: p.page_number,
      template: p.template as Page['template'],
      strokes: p.strokes ?? [],
      textAnnotations: p.text_annotations ?? [],
      backgroundPdfUrl: p.background_pdf_url,
    })),
  };
}

// ─── Write ───────────────────────────────────────────────────────────────

export async function saveNotebook(notebook: Notebook): Promise<void> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const notebookId = notebook.id;
  // Get the current row with version to implement optimistic concurrency
  let { data: currentRow, error: fetchErr } = await supabase
    .from('notebooks')
    .select('version')
    .eq('id', notebookId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!currentRow) {
    // Notebook doesn't exist yet, treat as version 0
    currentRow = { version: 0 };
  }

  const clientVersion = notebook.version ?? 1;
  if (currentRow?.version && clientVersion > currentRow.version) {
    // Handle merge conflict if client version jumps ahead
    console.warn(`Version mismatch for notebook ${notebookId}: local=${currentRow.version}, client=${clientVersion}`);
    // Optionally throw an error or handle automatically
  }

  const newVersion = Math.max((currentRow?.version ?? 0) + 1, clientVersion);

  const now = Date.now();

  // created_date is a plain text column (YYYY-MM-DD), not a generated one,
  // so derive it lazily here rather than relying on the caller to set it.
  const created_date =
    notebook.created_date ??
    (notebook.createdAt ? new Date(notebook.createdAt).toISOString().slice(0, 10) : null);

  const { error: nbErr } = await supabase.from('notebooks').upsert({
    id: notebookId,
    user_id: user.id,
    title: notebook.title,
    cover_color: notebook.coverColor,
    cover_style: notebook.coverStyle,
    created_at: notebook.createdAt,
    created_date,
    updated_at: now,
    version: newVersion,
    ai_chat: notebook.aiChat ?? [],
  });
  if (nbErr) throw nbErr;

  // Upsert all pages in a single request (strokes stored as JSONB)
  const rows = notebook.pages.map((page) => ({
    id: page.id,
    notebook_id: notebookId,
    page_number: page.pageNumber,
    template: page.template,
    strokes: page.strokes,
    text_annotations: page.textAnnotations ?? [],
    updated_at: now,
  }));
  if (rows.length > 0) {
    const { error: pErr } = await supabase
      .from('pages')
      .upsert(rows, { onConflict: 'id' });
    if (pErr) throw pErr;
  }

  // Remove pages that no longer exist locally so stale rows don't
  // resurface on the next read (the old IndexedDB store replaced the
  // whole notebook record, so this is a behavior change from before).
  const keepIds = notebook.pages.map((p) => p.id);
  let del = supabase.from('pages').delete().eq('notebook_id', notebookId);
  if (keepIds.length > 0) {
    del = del.not('id', 'in', `(${keepIds.join(',')})`);
  }
  const { error: dErr } = await del;
  if (dErr) throw dErr;
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
    created_date: new Date().toISOString().slice(0, 10),
    coverColor: '#1976d2',
    coverStyle: 'classic',
    pages: [
      {
        id: 'pg_' + Math.random().toString(36).substring(2, 9),
        pageNumber: 1,
        template: 'ruled',
        strokes: [],
        textAnnotations: [],
      },
    ],
  };
  await saveNotebook(newNotebook);
  return newNotebook;
}

// ─── Folders ──────────────────────────────────────────────────────────────

export interface Folder {
  id: string;
  user_id?: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  created_date?: string;
}

export async function createFolder(name: string): Promise<Folder> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const now = Date.now();
  const folder: Folder = {
    id: 'fld_' + Math.random().toString(36).substring(2, 9),
    user_id: user.id,
    name,
    createdAt: now,
    updatedAt: now,
    created_date: new Date().toISOString().slice(0, 10),
  };
  // Map camelCase fields to the snake_case column names in the DB
  const { error } = await supabase.from('folders').insert({
    id: folder.id,
    user_id: folder.user_id,
    name: folder.name,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
    created_date: folder.created_date,
  });
  if (error) throw error;
  return folder;
}

export async function getFolders(): Promise<Folder[]> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: rows, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    created_date: r.created_date,
  }));
}

export async function deleteFolder(id: string): Promise<void> {
  ensureSignedIn();
  // notebook_folders rows are deleted via ON DELETE CASCADE
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) throw error;
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  ensureSignedIn();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const { data: row, error } = await supabase
    .from('folders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.user_id !== user.id) return undefined;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    created_date: row.created_date,
  };
}

// ─── Notebook ↔ folder links ──────────────────────────────────────────────

export async function addNotebookToFolder(notebookId: string, folderId: string): Promise<void> {
  ensureSignedIn();
  const { error } = await supabase.from('notebook_folders').insert({
    notebook_id: notebookId,
    folder_id: folderId,
    created_at: Date.now(),
  });
  if (error) throw error;
}

export async function removeNotebookFromFolder(notebookId: string, folderId: string): Promise<void> {
  ensureSignedIn();
  const { error } = await supabase
    .from('notebook_folders')
    .delete()
    .eq('notebook_id', notebookId)
    .eq('folder_id', folderId);
  if (error) throw error;
}

export async function getNotebooksInFolder(folderId: string): Promise<Notebook[]> {
  ensureSignedIn();
  const { data: rows, error } = await supabase
    .from('notebook_folders')
    .select('notebook_id')
    .eq('folder_id', folderId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.notebook_id).filter(Boolean);
  if (ids.length === 0) return [];
  return getNotebooksByIds(ids);
}

export async function getFoldersForNotebook(notebookId: string): Promise<Folder[]> {
  ensureSignedIn();
  const { data: rows, error } = await supabase
    .from('notebook_folders')
    .select('folder_id')
    .eq('notebook_id', notebookId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.folder_id).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: folderRows, error: fErr } = await supabase
    .from('folders')
    .select('*')
    .in('id', ids);
  if (fErr) throw fErr;
  return (folderRows ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    created_date: r.created_date,
  }));
}

// Helper: fetch several notebooks by id (used by folder queries)
async function getNotebooksByIds(ids: string[]): Promise<Notebook[]> {
  const { data: nbRows, error: nbErr } = await supabase
    .from('notebooks')
    .select('*')
    .in('id', ids);
  if (nbErr) throw nbErr;
  if (!nbRows || nbRows.length === 0) return [];
  const pagesByNotebook = await fetchAllPages(nbRows.map((r) => r.id));
  return nbRows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    created_date: row.created_date,
    coverColor: row.cover_color,
    coverStyle: row.cover_style as Notebook['coverStyle'],
    version: row.version,
    aiChat: row.ai_chat ?? [],
    pages: (pagesByNotebook.get(row.id) ?? []).map((p) => ({
      id: p.id,
      pageNumber: p.page_number,
      template: p.template as Page['template'],
      strokes: p.strokes ?? [],
      textAnnotations: p.text_annotations ?? [],
      backgroundPdfUrl: p.background_pdf_url,
    })),
  }));
}