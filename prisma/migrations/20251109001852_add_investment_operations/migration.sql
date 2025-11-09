-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('COMPRA', 'VENTA', 'AJUSTE');

-- CreateTable
CREATE TABLE "InvestmentOperation" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "type" "OperationType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentOperation_investmentId_idx" ON "InvestmentOperation"("investmentId");

-- CreateIndex
CREATE INDEX "InvestmentOperation_createdAt_idx" ON "InvestmentOperation"("createdAt");

-- AddForeignKey
ALTER TABLE "InvestmentOperation" ADD CONSTRAINT "InvestmentOperation_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
