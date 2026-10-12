-- ============================================
-- Soucha Operating Hours System Migration
-- ============================================

CREATE TABLE IF NOT EXISTS public.shop_operating_hours (
  day_of_week integer PRIMARY KEY CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open boolean NOT NULL DEFAULT false,
  open_time time,
  close_time time,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shop_operating_hours ENABLE ROW LEVEL SECURITY;

-- Public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'shop_operating_hours' AND policyname = 'Allow public read of operating hours'
  ) THEN
    CREATE POLICY "Allow public read of operating hours"
      ON public.shop_operating_hours FOR SELECT
      USING (true);
  END IF;
END
$$;

-- Grant permissions
GRANT SELECT ON public.shop_operating_hours TO anon;
GRANT ALL ON public.shop_operating_hours TO service_role;

-- Seed default data if empty
INSERT INTO public.shop_operating_hours (day_of_week, is_open, open_time, close_time) VALUES
  (1, true, '10:00:00', '18:00:00'),
  (2, true, '10:00:00', '18:00:00'),
  (3, true, '10:00:00', '18:00:00'),
  (4, true, '10:00:00', '18:00:00'),
  (5, true, '10:00:00', '18:00:00'),
  (6, true, '10:00:00', '18:00:00'),
  (0, false, null, null)
ON CONFLICT (day_of_week) DO NOTHING;
