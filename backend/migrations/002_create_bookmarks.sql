-- Enable ltree extension for hierarchical bookmark paths
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    url TEXT,
    path ltree NOT NULL,
    is_folder BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- GiST index for ltree path queries (e.g. find all children of a folder)
CREATE INDEX IF NOT EXISTS bookmarks_path_gist_idx ON bookmarks USING GIST (path);
CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON bookmarks (user_id);
