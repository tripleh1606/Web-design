-- ============================================
-- Soucha Customization Options Migration
-- ============================================

CREATE TABLE IF NOT EXISTS public.options (
  id text PRIMARY KEY,
  option_group text NOT NULL, -- 'size', 'powder', 'extra_powder', 'milk', 'sweetness', 'ice', 'topping'
  label text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  extra_price numeric(12,2) NOT NULL DEFAULT 0, -- Used for extra_price_per_gram in powder
  is_available boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many relationship for options that are category-specific (e.g. toppings, powders)
CREATE TABLE IF NOT EXISTS public.category_options (
  category_id text NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  option_id text NOT NULL REFERENCES public.options(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, option_id)
);

-- Enable RLS
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_options ENABLE ROW LEVEL SECURITY;

-- Public read policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'options' AND policyname = 'Allow public read of available options') THEN
    CREATE POLICY "Allow public read of available options" ON public.options FOR SELECT USING (is_available = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'category_options' AND policyname = 'Allow public read of category_options') THEN
    CREATE POLICY "Allow public read of category_options" ON public.category_options FOR SELECT USING (true);
  END IF;
END
$$;

GRANT SELECT ON public.options TO anon;
GRANT ALL ON public.options TO service_role;
GRANT SELECT ON public.category_options TO anon;
GRANT ALL ON public.category_options TO service_role;

-- Seed Data for Options
INSERT INTO public.options (id, option_group, label, price, extra_price, is_default, sort_order) VALUES
  -- Size
  ('size-m', 'size', 'M', 0, 0, true, 1),
  ('size-l', 'size', 'L', 5000, 0, false, 2),
  
  -- Powder (extra_price is extraPricePerGram)
  ('powder-dai', 'powder', 'Đài', 0, 3000, false, 1),
  ('powder-olong', 'powder', 'Olong', 0, 3000, false, 2),
  ('powder-satoen', 'powder', 'Satoen Premium', 0, 3000, false, 3),
  ('powder-fuji', 'powder', 'Fuji no haru', 10000, 5000, false, 4),
  ('powder-mk4', 'powder', 'MK4', 12000, 6000, false, 5),
  ('powder-chiran', 'powder', 'Chiran', 15000, 8000, false, 6),
  ('powder-houjicha', 'powder', 'Houjicha', 0, 3000, false, 7),
  
  -- Extra powder grams
  ('extra-0', 'extra_powder', '0g', 0, 0, true, 1),
  ('extra-1', 'extra_powder', '+1g', 0, 0, false, 2),
  ('extra-2', 'extra_powder', '+2g', 0, 0, false, 3),
  ('extra-3', 'extra_powder', '+3g', 0, 0, false, 4),
  ('extra-4', 'extra_powder', '+4g', 0, 0, false, 5),
  ('extra-5', 'extra_powder', '+5g', 0, 0, false, 6),
  
  -- Milk
  ('milk-mlekovita', 'milk', 'Sữa Mlekovita', 0, 0, true, 1),
  ('milk-meji', 'milk', 'Sữa Meji đỏ', 8000, 0, false, 2),
  ('milk-oat', 'milk', 'Sữa Alternative (Oat)', 7000, 0, false, 3),
  
  -- Sweetness
  ('sweet-0', 'sweetness', '0%', 0, 0, false, 1),
  ('sweet-25', 'sweetness', '25%', 0, 0, false, 2),
  ('sweet-50', 'sweetness', '50%', 0, 0, false, 3),
  ('sweet-75', 'sweetness', '75%', 0, 0, true, 4),
  ('sweet-100', 'sweetness', '100%', 0, 0, false, 5),
  
  -- Ice
  ('ice-shared', 'ice', 'Đá chung', 0, 0, true, 1),
  ('ice-separate', 'ice', 'Đá riêng', 0, 0, false, 2),
  
  -- Toppings
  ('topping-oreo', 'topping', 'Extra vụn Oreo', 5000, 0, false, 1),
  ('topping-dau', 'topping', 'Extra mứt dâu', 5000, 0, false, 2),
  ('topping-caramel', 'topping', 'Extra caramel', 5000, 0, false, 3),
  ('topping-kem-muoi', 'topping', 'Kem muối', 10000, 0, false, 4),
  ('topping-kem-cheese', 'topping', 'Kem cheese dẻo', 12000, 0, false, 5)
ON CONFLICT (id) DO UPDATE SET 
  option_group = EXCLUDED.option_group,
  label = EXCLUDED.label,
  price = EXCLUDED.price,
  extra_price = EXCLUDED.extra_price,
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order;

-- Category mappings (based on current app rules)
-- By default:
-- ALL matcha powders are assigned to 'matcha' category
-- ALL houjicha powders are assigned to 'houjicha' category
-- ALL toppings are assigned to ALL categories initially, to preserve current unrestricted behavior

INSERT INTO public.category_options (category_id, option_id) VALUES
  ('matcha', 'powder-dai'),
  ('matcha', 'powder-olong'),
  ('matcha', 'powder-satoen'),
  ('matcha', 'powder-fuji'),
  ('matcha', 'powder-mk4'),
  ('matcha', 'powder-chiran'),
  ('houjicha', 'powder-houjicha'),
  
  ('matcha', 'topping-oreo'),
  ('matcha', 'topping-dau'),
  ('matcha', 'topping-caramel'),
  ('matcha', 'topping-kem-muoi'),
  ('matcha', 'topping-kem-cheese'),
  
  ('houjicha', 'topping-oreo'),
  ('houjicha', 'topping-dau'),
  ('houjicha', 'topping-caramel'),
  ('houjicha', 'topping-kem-muoi'),
  ('houjicha', 'topping-kem-cheese')
ON CONFLICT DO NOTHING;
