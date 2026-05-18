CREATE TABLE IF NOT EXISTS api_access_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_date DATE NOT NULL DEFAULT CURRENT_DATE,
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    request_count BIGINT NOT NULL DEFAULT 0,
    last_access_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(access_date, method, path, status_code)
);

CREATE INDEX IF NOT EXISTS idx_api_access_stats_date ON api_access_stats(access_date);
CREATE INDEX IF NOT EXISTS idx_api_access_stats_path ON api_access_stats(path);
CREATE INDEX IF NOT EXISTS idx_api_access_stats_status ON api_access_stats(status_code);
