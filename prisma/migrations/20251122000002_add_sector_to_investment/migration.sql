-- AlterTable
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Investment' AND column_name = 'sector') THEN
        ALTER TABLE "Investment" ADD COLUMN "sector" TEXT;
    END IF;
END $$;

