-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "currentAmount" DOUBLE PRECISION NOT NULL,
    "tag" TEXT,
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
