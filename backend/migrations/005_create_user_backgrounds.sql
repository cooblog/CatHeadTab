-- Store user-uploaded background images as WebP binary data.
-- Using BYTEA for simplicity (no external object storage dependency).
-- Images are compressed to WebP on the backend, max ~2MB after compression.

CREATE TABLE IF NOT EXISTS user_backgrounds (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    image_data BYTEA NOT NULL,
    content_type VARCHAR(50) NOT NULL DEFAULT 'image/webp',
    file_size INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE user_backgrounds IS 'Stores one background image per user as compressed WebP binary';
