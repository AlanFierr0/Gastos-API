-- CreateTable
CREATE TABLE "FinancialAnalysisConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "fixed" JSONB NOT NULL DEFAULT '[]',
    "wellbeing" JSONB NOT NULL DEFAULT '[]',
    "saving" JSONB NOT NULL DEFAULT '[]',
    "targetFixed" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "targetWellbeing" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "targetSaving" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAnalysisConfig_pkey" PRIMARY KEY ("id")
);
