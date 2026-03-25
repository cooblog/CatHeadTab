-- 012_preset_sites_search_index.sql
-- Enable pg_trgm extension for fuzzy/substring search with similarity ranking.
-- Create a GIN trigram index on the concatenated title+url+description for fast ILIKE queries.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_preset_sites_search
    ON preset_sites
    USING gin ((title || ' ' || url || ' ' || description) gin_trgm_ops);
