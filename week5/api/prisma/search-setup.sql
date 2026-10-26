-- Kích hoạt extension pg_trgm phục vụ fuzzy search (similarity, %, gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cột generated tsvector lưu sẵn document từ name (weight A) và description (weight B), xử lý NULL bằng coalesce
ALTER TABLE dishes
ADD COLUMN IF NOT EXISTS fts tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'B')
) STORED;

-- GIN Index cho Full-Text Search trên cột fts
CREATE INDEX IF NOT EXISTS dishes_fts_idx
ON dishes USING gin (fts);

-- GIN Index (pg_trgm) cho Fuzzy Search trên cột name
CREATE INDEX IF NOT EXISTS dishes_name_trgm_idx
ON dishes USING gin (name gin_trgm_ops);

-- B-Tree Index hỗ trợ lọc nâng cao (advanced search) trên category, available, price
CREATE INDEX IF NOT EXISTS dishes_adv_filter_idx
ON dishes (category, available, price);
