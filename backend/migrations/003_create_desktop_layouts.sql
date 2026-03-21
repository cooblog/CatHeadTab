-- Desktop layout storage using JSONB for flexibility
CREATE TABLE IF NOT EXISTS desktop_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    device_type VARCHAR(20) DEFAULT 'desktop',
    layout_data JSONB NOT NULL DEFAULT '{"items": [], "widgets": []}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS desktop_layouts_user_id_idx ON desktop_layouts (user_id);
