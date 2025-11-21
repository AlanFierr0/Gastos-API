-- AlterTable
-- Add date column with default value for existing records
ALTER TABLE "Investment" ADD COLUMN     "date" TIMESTAMP(3);

-- Set date to createdAt for existing records
UPDATE "Investment" SET "date" = "createdAt" WHERE "date" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "Investment" ALTER COLUMN "date" SET NOT NULL;
