-- Tìm kiếm quản trị (05/11): không phân biệt hoa thường + dấu tiếng Việt.
-- unaccent() bỏ dấu (kể cả đ → d), pg_trgm cho index tìm chuỗi con (LIKE '%...%').
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() là STABLE (phụ thuộc search_path) nên không dùng được trong index.
-- Bọc lại thành hàm IMMUTABLE, chỉ định rõ dictionary theo schema public.
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Index trigram trên đúng biểu thức mà câu tìm kiếm dùng: lower(f_unaccent(cột)).
CREATE INDEX IF NOT EXISTS idx_users_name_search
  ON users USING gin (lower(f_unaccent(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_search
  ON users USING gin (lower(email) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_devices_name_search
  ON devices USING gin (lower(f_unaccent(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time
  ON bookings (start_time);
