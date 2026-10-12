-- ============================================
-- Soucha Products Table Migration
-- ============================================

CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  family text NOT NULL DEFAULT 'matcha',
  base_price numeric(12,2) NOT NULL,
  image text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Public read policy (only available products)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Allow public read of available products'
  ) THEN
    CREATE POLICY "Allow public read of available products"
      ON public.products FOR SELECT
      USING (is_available = true);
  END IF;
END
$$;

-- Service role full access
GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO service_role;

-- Seed with existing hardcoded products
INSERT INTO public.products (id, name, family, base_price, image, is_available, sort_order) VALUES
  ('matcha-latte', 'Matcha Latte', 'matcha', 30000, '/beverages/matcha-latte.jpeg', true, 1),
  ('matcha-cold-whisk', 'Matcha Cold Whisk', 'matcha', 32000, '/beverages/matcha-cold-whisk.jpeg', true, 2),
  ('matcha-dau', 'Matcha Dâu', 'matcha', 37000, '/beverages/matcha-dau.jpeg', true, 3),
  ('matcha-caramel', 'Matcha Caramel', 'matcha', 35000, '/beverages/matcha-caramel.jpeg', true, 4),
  ('matcha-oreo', 'Matcha Oreo Kem Cheese Dẻo', 'matcha', 44000, '/beverages/matcha-oreo.jpeg', true, 5),
  ('matcha-kem-muoi', 'Matcha Kem Muối', 'matcha', 40000, '/beverages/matcha-kem-muoi.jpeg', true, 6),
  ('houjicha-latte', 'Houjicha Latte', 'houjicha', 30000, '/beverages/houjicha-latte.jpeg', true, 7),
  ('houjicha-cold-whisk', 'Houjicha Cold Whisk', 'houjicha', 32000, '/beverages/houjicha-cold-whisk.jpeg', true, 8)
ON CONFLICT (id) DO NOTHING;

