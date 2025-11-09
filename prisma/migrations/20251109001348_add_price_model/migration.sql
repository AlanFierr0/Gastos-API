-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Price_symbol_key" ON "Price"("symbol");

-- CreateIndex
CREATE INDEX "Price_symbol_idx" ON "Price"("symbol");

-- CreateIndex
CREATE INDEX "Price_type_idx" ON "Price"("type");
