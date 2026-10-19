import { Notebook, Page, Stroke, getAllNotebooks, getNotebook, saveNotebook } from './db';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// ─── Supabase row shapes ───────────────────────────────────────────────
interface NotebookRow {
  id: string;
  user_id: string;
  title: string;
  cover_color: string;
  cover_style: string;
  created_at: number;
  updated_at: number;
}

interface PageRow {
  id: string;
  notebook_id: string;
  page_number: number;
  template: string;
  strokes: Stroke[];
  updated_at: number;
}

// ─── Push local changes to Supabase ────────────────────────────────────
export async function syncNotebookToSupabase(notebook: Notebook): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return;

  // Upsert notebook metadata
  await supabase.from('notebooks').upsert({
    id: notebook.id,
    user_id: user.user.id,
    title: notebook.title,
    cover_color: notebook.coverColor,
    cover_style: notebook.coverStyle,
    created_at: notebook.createdAt,
    updated_at: notebook.updatedAt,
  });

  // Upsert every page (strokes stored as JSONB)
  for (const page of notebook.pages) {
    await supabase.from('pages').upsert({
      id: page.id,
      notebook_id: notebook.id,
      page_number: page.pageNumber,
      template: page.template,
      strokes: page.strokes,
      updated_at: Date.now(),
    });
  }
}

// ─── Pull latest changes from Supabase and merge into IndexedDB ────────
export async function syncNotebooksFromSupabase(): Promise<Notebook[] | null> {
  if (!isSupabaseConfigured) return null;

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return null;

  // Fetch all notebooks for this user
  const { data: nbRows, error: nbErr } = await supabase
    .from('notebooks')
    .select('*')
    .eq('user_id', user.user.id)
    .order('updated_at', { ascending: false });

  if (nbErr || !nbRows) return null;

  const cloudNotebooks: Notebook[] = [];

  for (const row of nbRows as NotebookRow[]) {
    // Fetch pages for this notebook
    const { data: pageRows } = await supabase
      .from('pages')
      .select('*')
      .eq('notebook_id', row.id)
      .order('page_number', { ascending: true });

    const pages: Page[] = (pageRows as PageRow[] | null)?.map((p) => ({
      id: p.id,
      pageNumber: p.page_number,
      template: p.template as Page['template'],
      strokes: p.strokes ?? [],
    })) ?? [];

    const cloudNb: Notebook = {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      coverColor: row.cover_color,
      coverStyle: row.cover_style as Notebook['coverStyle'],
      pages,
    };

    cloudNotebooks.push(cloudNb);
  }

  // Merge: keep whichever has the newer updated_at
  const localNotebooks = await getAllNotebooks();
  const localMap = new Map(localNotebooks.map((nb) => [nb.id, nb]));

  for (const cloud of cloudNotebooks) {
    const local = localMap.get(cloud.id);
    if (!local || cloud.updatedAt > local.updatedAt) {
      await saveNotebook(cloud);
    }
  }

  return cloudNotebooks;
}

// ─── Full bidirectional sync ───────────────────────────────────────────
export async function performFullSync(): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return;

  // 1. Push local changes
  const localNotebooks = await getAllNotebooks();
  for (const nb of localNotebooks) {
    await syncNotebookToSupabase(nb);
  }

  // 2. Pull cloud changes
  await syncNotebooksFromSupabase();
}

// ─── Subscribe to real-time changes ────────────────────────────────────
export function subscribeToRealtime(
  onNotebookChange: (notebook: Notebook) => void,
  onPagesChange: (notebookId: string, pages: Page[]) => void
): ReturnType<typeof supabase.channel> | null {
  if (!isSupabaseConfigured) return null;

  const channel = supabase.channel('nohomework-sync');

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notebooks',
      },
      async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const row = payload.new as NotebookRow;
          const nb: Notebook = {
            id: row.id,
            title: row.title,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            coverColor: row.cover_color,
            coverStyle: row.cover_style as Notebook['coverStyle'],
            pages: [],
          };
          onNotebookChange(nb);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pages',
      },
      async (payload) => {
        const row = payload.new as PageRow;
        const page: Page = {
          id: row.id,
          pageNumber: row.page_number,
          template: row.template as Page['template'],
          strokes: row.strokes ?? [],
        };
        onPagesChange(row.notebook_id, [page]);
      }
    )
    .subscribe();

  return channel;
}