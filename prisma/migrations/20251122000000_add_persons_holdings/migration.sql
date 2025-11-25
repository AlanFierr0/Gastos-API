-- CreateTable
CREATE TABLE IF NOT EXISTS "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Holding" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "currentAmount" DOUBLE PRECISION NOT NULL,
    "tag" TEXT,
    "sector" TEXT,
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentPrice" DOUBLE PRECISION,
    "custodyEntity" TEXT,
    "x100" BOOLEAN NOT NULL DEFAULT false,
    "gbp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HoldingOperation" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "type" "OperationType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Holding_personId_idx" ON "Holding"("personId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Holding_categoryId_idx" ON "Holding"("categoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HoldingOperation_holdingId_idx" ON "HoldingOperation"("holdingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HoldingOperation_createdAt_idx" ON "HoldingOperation"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HoldingOperation_date_idx" ON "HoldingOperation"("date");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Holding_personId_fkey'
    ) THEN
        ALTER TABLE "Holding" ADD CONSTRAINT "Holding_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Holding_categoryId_fkey'
    ) THEN
        ALTER TABLE "Holding" ADD CONSTRAINT "Holding_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'HoldingOperation_holdingId_fkey'
    ) THEN
        ALTER TABLE "HoldingOperation" ADD CONSTRAINT "HoldingOperation_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
