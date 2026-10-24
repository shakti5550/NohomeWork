-- NohomeWork Supabase Schema
-- Copy and paste this entire block into your Supabase project's SQL Editor
-- and click "Run" once. It will create all tables in a single query.

-- 1. Notebooks table (stores notebook metadata)
CREATE TABLE IF NOT EXISTS notebooks (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  cover_color text DEFAULT '#1976d2',
  cover_style text DEFAULT 'classic',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_date text,
  version bigint NOT NULL DEFAULT 1,
  ai_chat jsonb DEFAULT '[]'::jsonb,
);

-- 2. Pages table (stores page data with strokes as JSONB)
CREATE TABLE IF NOT EXISTS pages (
  id text PRIMARY KEY,
  notebook_id text REFERENCES notebooks(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  template text DEFAULT 'ruled',
  strokes jsonb DEFAULT '[]'::jsonb,
  text_annotations jsonb DEFAULT '[]'::jsonb,
  updated_at bigint NOT NULL,
  version bigint NOT NULL DEFAULT 1,
);

-- 3. Enable real-time replication so changes sync instantly across devices
ALTER TABLE notebooks REPLICA IDENTITY FULL;
ALTER TABLE pages REPLICA IDENTITY FULL;

-- 4. Enable Row Level Security (optional but recommended)
ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- 5. Allow users to read/write only their own notebooks
CREATE POLICY "Users can manage their own notebooks"
  ON notebooks FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own pages"
  ON pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM notebooks
      WHERE notebooks.id = pages.notebook_id
      AND notebooks.user_id = auth.uid()
    )
  );

-- 6. Folders table (groups notebooks into user-owned collections)
CREATE TABLE IF NOT EXISTS folders (
  id          text PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  bigint NOT NULL,
  updated_at  bigint NOT NULL,
  created_date text
);

-- 7. Notebook ↔ folder link (a notebook may belong to many folders)
CREATE TABLE IF NOT EXISTS notebook_folders (
  notebook_id text REFERENCES notebooks(id) ON DELETE CASCADE,
  folder_id   text REFERENCES folders(id) ON DELETE CASCADE,
  created_at  bigint NOT NULL,
  PRIMARY KEY (notebook_id, folder_id)
);

-- 8. Favourite flag on notebooks
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

-- 9. Row Level Security for the new tables
CREATE POLICY "Users can manage their own folders"
  ON folders FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own notebook-folder links"
  ON notebook_folders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM folders
      WHERE folders.id = notebook_folders.folder_id
      AND folders.user_id = auth.uid()
    )
  );

-- 10. Indexes for the new tables
CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders (user_id);
CREATE INDEX IF NOT EXISTS notebook_folders_folder_id_idx ON notebook_folders (folder_id);