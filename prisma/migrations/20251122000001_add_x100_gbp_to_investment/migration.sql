-- AlterTable
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Investment' AND column_name = 'x100') THEN
        ALTER TABLE "Investment" ADD COLUMN "x100" BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Investment' AND column_name = 'gbp') THEN
        ALTER TABLE "Investment" ADD COLUMN "gbp" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

