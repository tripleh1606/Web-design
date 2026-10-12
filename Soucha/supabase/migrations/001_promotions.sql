-- ============================================
-- Soucha Promotions System Migration
-- ============================================

-- 1. Create promotions table
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('percentage', 'fixed_amount', 'buy_x_get_y', 'free_upsize')),
  is_active boolean NOT NULL DEFAULT true,
  allow_stacking boolean NOT NULL DEFAULT false,
  min_quantity integer NOT NULL DEFAULT 0,
  min_order_value numeric(12,2) NOT NULL DEFAULT 0,
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  buy_quantity integer NOT NULL DEFAULT 0,
  get_quantity integer NOT NULL DEFAULT 1,
  applicable_product_id text NULL,
  reward_product_id text NULL,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Extend orders table with discount tracking
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS applied_promotions jsonb DEFAULT '[]'::jsonb;

-- 3. Enable RLS on promotions
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- 4. Public read policy for active promotions only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'promotions' AND policyname = 'Allow public read of active promotions'
  ) THEN
    CREATE POLICY "Allow public read of active promotions"
      ON public.promotions FOR SELECT
      USING (is_active = true);
  END IF;
END
$$;

-- 5. Grant permissions
GRANT SELECT ON public.promotions TO anon;
GRANT ALL ON public.promotions TO service_role;

-- 6. Create index for active promotion queries
CREATE INDEX IF NOT EXISTS idx_promotions_active ON public.promotions (is_active) WHERE is_active = true;
