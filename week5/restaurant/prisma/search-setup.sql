-- Prisma owns the nullable tsvector column; SQL owns automatic maintenance.
-- Run the entire file (comments, functions and DO blocks included).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.soucha_refresh_dish_fts()
RETURNS trigger LANGUAGE plpgsql AS $fts_function$
BEGIN
  NEW.fts :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$fts_function$;

DO $fts_setup$
BEGIN
  -- Safe before db:push on a new database; the post-push run finishes setup.
  IF to_regclass('public.dishes') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.dishes ADD COLUMN IF NOT EXISTS fts tsvector;
  -- Upgrade the teammate's generated column without dropping the column,
  -- its data, or its indexes. Future changes are maintained by the trigger.
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.dishes'::regclass AND attname = 'fts'
      AND attgenerated <> '' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.dishes ALTER COLUMN fts DROP EXPRESSION;
  END IF;

  DROP TRIGGER IF EXISTS dishes_fts_refresh ON public.dishes;
  CREATE TRIGGER dishes_fts_refresh
    BEFORE INSERT OR UPDATE OF name, description, fts ON public.dishes
    FOR EACH ROW EXECUTE FUNCTION public.soucha_refresh_dish_fts();

  UPDATE public.dishes
  SET fts =
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  WHERE fts IS DISTINCT FROM (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  );

  CREATE INDEX IF NOT EXISTS dishes_fts_idx ON public.dishes USING gin (fts);
  CREATE INDEX IF NOT EXISTS dishes_name_trgm_idx ON public.dishes USING gin (name gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS dishes_adv_filter_idx ON public.dishes (category, available, price);
END;
$fts_setup$;
COMMIT;
