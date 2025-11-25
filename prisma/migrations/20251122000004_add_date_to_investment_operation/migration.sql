-- AlterTable
-- Add date column with default value for existing records
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'InvestmentOperation' AND column_name = 'date') THEN
        ALTER TABLE "InvestmentOperation" ADD COLUMN "date" TIMESTAMP(3);
        -- Set date to createdAt for existing records
        UPDATE "InvestmentOperation" SET "date" = "createdAt" WHERE "date" IS NULL;
        -- Now make it NOT NULL
        ALTER TABLE "InvestmentOperation" ALTER COLUMN "date" SET NOT NULL;
    END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InvestmentOperation_date_idx" ON "InvestmentOperation"("date");

