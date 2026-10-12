-- ============================================
-- Soucha Promotions Scope Migration
-- ============================================

-- 1. Add scope column to promotions
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'products', 'categories'));

-- 2. Create promotion_products mapping table
CREATE TABLE IF NOT EXISTS public.promotion_products (
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, product_id)
);

-- 3. Create promotion_categories mapping table
CREATE TABLE IF NOT EXISTS public.promotion_categories (
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, category_id)
);

-- 4. Enable RLS
ALTER TABLE public.promotion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_categories ENABLE ROW LEVEL SECURITY;

-- 5. Public read policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promotion_products' AND policyname = 'Allow public read of promotion_products') THEN
    CREATE POLICY "Allow public read of promotion_products" ON public.promotion_products FOR SELECT USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'promotion_categories' AND policyname = 'Allow public read of promotion_categories') THEN
    CREATE POLICY "Allow public read of promotion_categories" ON public.promotion_categories FOR SELECT USING (true);
  END IF;
END
$$;

-- 6. Grant permissions
GRANT SELECT ON public.promotion_products TO anon;
GRANT ALL ON public.promotion_products TO service_role;
GRANT SELECT ON public.promotion_categories TO anon;
GRANT ALL ON public.promotion_categories TO service_role;

-- 7. Migrate existing applicable_product_id data
INSERT INTO public.promotion_products (promotion_id, product_id)
SELECT id, applicable_product_id 
FROM public.promotions 
WHERE applicable_product_id IS NOT NULL 
AND applicable_product_id IN (SELECT id FROM public.products)
ON CONFLICT DO NOTHING;

UPDATE public.promotions 
SET scope = 'products' 
WHERE applicable_product_id IS NOT NULL;

