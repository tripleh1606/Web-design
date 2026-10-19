-- ============================================
-- Soucha Storage Migration for Product Images
-- ============================================

-- Create a bucket for product images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to the bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access for product-images'
  ) THEN
    CREATE POLICY "Public Access for product-images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'product-images');
  END IF;
END
$$;
