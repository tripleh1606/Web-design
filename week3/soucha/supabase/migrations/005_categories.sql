-- ============================================
-- Soucha Categories Table Migration
-- ============================================

CREATE TABLE IF NOT EXISTS public.categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Public read policy (only available categories)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Allow public read of available categories'
  ) THEN
    CREATE POLICY "Allow public read of available categories"
      ON public.categories FOR SELECT
      USING (is_available = true);
  END IF;
END
$$;

GRANT SELECT ON public.categories TO anon;
GRANT ALL ON public.categories TO service_role;

-- Seed with existing hardcoded categories
INSERT INTO public.categories (id, name, is_available, sort_order) VALUES
  ('matcha', 'Matcha', true, 1),
  ('houjicha', 'Houjicha', true, 2)
ON CONFLICT (id) DO NOTHING;
