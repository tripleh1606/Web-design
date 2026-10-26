-- PostgreSQL / Supabase core schema with Week 5 search support.
-- Run this file only for a NEW empty database; existing databases use db:search-setup.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "dishes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "category" TEXT,
    "image" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fts" tsvector,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chefs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dish_ingredients" (
    "dishId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "dish_ingredients_pkey" PRIMARY KEY ("dishId","ingredientId")
);

-- CreateTable
CREATE TABLE "chef_dishes" (
    "chefId" INTEGER NOT NULL,
    "dishId" INTEGER NOT NULL,

    CONSTRAINT "chef_dishes_pkey" PRIMARY KEY ("chefId","dishId")
);

-- CreateIndex
CREATE INDEX "dishes_fts_idx" ON "dishes" USING GIN ("fts");

-- CreateIndex
CREATE INDEX "dishes_name_trgm_idx" ON "dishes" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "dishes_adv_filter_idx" ON "dishes"("category", "available", "price");

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_dishes" ADD CONSTRAINT "chef_dishes_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "chefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chef_dishes" ADD CONSTRAINT "chef_dishes_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


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
