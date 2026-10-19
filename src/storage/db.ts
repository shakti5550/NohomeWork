import { openDB, DBSchema, IDBPDatabase } from 'idb';

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

interface NohomeWorkDB extends DBSchema {
  notebooks: {
    key: string;
    value: Notebook;
    indexes: { 'by-updated': number };
  };
}

let dbPromise: Promise<IDBPDatabase<NohomeWorkDB>> | null = null;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<NohomeWorkDB>('nohomework-db', 1, {
      upgrade(db) {
        const store = db.createObjectStore('notebooks', { keyPath: 'id' });
        store.createIndex('by-updated', 'updatedAt');
      },
    });
  }
  return dbPromise;
};

export async function getAllNotebooks(): Promise<Notebook[]> {
  const db = await getDB();
  return db.getAllFromIndex('notebooks', 'by-updated');
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  const db = await getDB();
  return db.get('notebooks', id);
}

export async function saveNotebook(notebook: Notebook): Promise<void> {
  const db = await getDB();
  notebook.updatedAt = Date.now();
  await db.put('notebooks', notebook);
}

export async function deleteNotebook(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('notebooks', id);
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
