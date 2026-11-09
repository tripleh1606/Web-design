-- Prisma owns the nullable tsvector column; SQL owns automatic maintenance.
-- Run the entire file (comments, functions and DO blocks included).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Dictionary normalization is STABLE, not IMMUTABLE: unaccent rules can change.
-- Support extensions installed either in public or Supabase's extensions schema.
CREATE OR REPLACE FUNCTION public.soucha_normalize_search(value text)
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions
AS $normalize_search$
  SELECT lower(unaccent(normalize(coalesce(value, ''), NFC)));
$normalize_search$;

-- Score already-normalized individual words, independently of token order.
-- >= 0.5: ordinary typo; 0.35: weak character-bag suggestion; 0: unrelated.
CREATE OR REPLACE FUNCTION public.soucha_word_score(p_term text, p_word text, p_term_count integer)
RETURNS real LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, public, extensions
AS $word_score$
DECLARE
  term_length integer := length(p_term);
  word_length integer := length(p_word);
  budget integer;
  distance integer;
  score real := 0;
  trigram real;
  common_letters integer;
BEGIN
  IF p_term = p_word THEN RETURN 1; END IF;
  -- A two-letter typo needs another query word to provide context.
  IF term_length < 2 OR word_length < 2 OR (term_length = 2 AND p_term_count < 2) THEN RETURN 0; END IF;
  budget := CASE WHEN term_length <= 4 THEN 1 ELSE 2 END;
  IF abs(term_length - word_length) <= budget THEN
    distance := levenshtein_less_equal(p_term, p_word, budget);
    IF distance <= budget THEN
      score := 1.0 - distance::real / greatest(term_length, word_length);
    END IF;
    IF term_length = word_length AND EXISTS (
      SELECT 1 FROM generate_series(1, term_length - 1) AS positions(i)
      WHERE p_word = left(p_term, i - 1) || substr(p_term, i + 1, 1) || substr(p_term, i, 1) || substr(p_term, i + 2)
    ) THEN score := greatest(score, 0.8); END IF;
    IF term_length >= 3 THEN
      trigram := similarity(p_term, p_word);
      IF trigram >= 0.3 THEN score := greatest(score, 0.5 + 0.49 * trigram); END IF;
    END IF;
  END IF;
  IF score >= 0.5 THEN RETURN score; END IF;
  -- Reordered letters are weak evidence. Preserve repeated-letter counts,
  -- require >=80% overlap and limit this fallback to short words.
  IF term_length BETWEEN 4 AND 12 AND abs(term_length - word_length) <= 1 THEN
    SELECT coalesce(sum(least(q.n, w.n)), 0)::integer INTO common_letters
    FROM (SELECT letter, count(*) AS n FROM regexp_split_to_table(p_term, '') AS letters(letter) GROUP BY letter) AS q
    JOIN (SELECT letter, count(*) AS n FROM regexp_split_to_table(p_word, '') AS letters(letter) GROUP BY letter) AS w USING (letter);
    IF common_letters::real / greatest(term_length, word_length) >= 0.8 THEN RETURN 0.35; END IF;
  END IF;
  RETURN 0;
END;
$word_score$;

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
