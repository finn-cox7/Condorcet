-- Add Race.slug: the URL form of Race.name, e.g. "new-hampshire-senate-2026".
--
-- Done in three steps because the table already has rows. Postgres cannot add
-- a NOT NULL column to a non-empty table without a value for the existing
-- rows, so the column goes on as nullable, gets backfilled from name, and is
-- only then tightened.

-- 1. Add nullable.
ALTER TABLE "Race" ADD COLUMN "slug" TEXT;

-- 2. Backfill from name: lowercase, spaces to hyphens.
--    Every existing name is letters, digits and single spaces only.
UPDATE "Race" SET "slug" = lower(replace("name", ' ', '-')) WHERE "slug" IS NULL;

-- 3. Tighten to required + unique.
ALTER TABLE "Race" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Race_slug_key" ON "Race"("slug");
