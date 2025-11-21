-- AlterTable
-- Add date column with default value for existing records
ALTER TABLE "InvestmentOperation" ADD COLUMN     "date" TIMESTAMP(3);

-- Set date to createdAt for existing records
UPDATE "InvestmentOperation" SET "date" = "createdAt" WHERE "date" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "InvestmentOperation" ALTER COLUMN "date" SET NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InvestmentOperation_date_idx" ON "InvestmentOperation"("date");

