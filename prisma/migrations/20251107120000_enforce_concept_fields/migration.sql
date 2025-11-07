-- Ensure required columns exist and migrate data for Expense and Income

-- Expense: add concept column, migrate data, rename notes to note, drop legacy name column
ALTER TABLE "Expense" ADD COLUMN "concept" TEXT;

UPDATE "Expense"
SET "concept" = CASE
  WHEN "name" IS NOT NULL AND length(trim("name")) > 0 THEN trim("name")
  WHEN "notes" IS NOT NULL AND length(trim("notes")) > 0 THEN trim("notes")
  ELSE 'sin concepto'
END;

ALTER TABLE "Expense"
ALTER COLUMN "concept" SET NOT NULL;

ALTER TABLE "Expense" RENAME COLUMN "notes" TO "note";

ALTER TABLE "Expense" DROP COLUMN "name";

-- Income: rename notes to note, add concept column, migrate data, ensure category
ALTER TABLE "Income" RENAME COLUMN "notes" TO "note";

ALTER TABLE "Income" ADD COLUMN "concept" TEXT;

UPDATE "Income"
SET "concept" = CASE
  WHEN "source" IS NOT NULL AND length(trim("source")) > 0 THEN trim("source")
  WHEN "note" IS NOT NULL AND length(trim("note")) > 0 THEN trim("note")
  ELSE 'sin concepto'
END;

ALTER TABLE "Income"
ALTER COLUMN "concept" SET NOT NULL;

-- Ensure there is at least one income category and assign a fallback for null categoryIds
INSERT INTO "CategoryType" ("id", "name")
VALUES ('11111111-1111-1111-1111-111111111111', 'income')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "Category" ("id", "name", "typeId")
SELECT '22222222-2222-2222-2222-222222222222', 'general', ct."id"
FROM "CategoryType" ct
WHERE lower(ct."name") = 'income'
  AND NOT EXISTS (
    SELECT 1 FROM "Category" c
    WHERE lower(c."name") = 'general' AND c."typeId" = ct."id"
  );

UPDATE "Income" SET "categoryId" = (
  SELECT c."id"
  FROM "Category" c
  WHERE c."typeId" = (
    SELECT ct."id" FROM "CategoryType" ct WHERE lower(ct."name") = 'income' LIMIT 1
  )
  ORDER BY c."name"
  LIMIT 1
)
WHERE "categoryId" IS NULL;

ALTER TABLE "Income"
ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "Income" DROP COLUMN "source";

