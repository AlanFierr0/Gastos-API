-- DropForeignKey
ALTER TABLE "public"."Income" DROP CONSTRAINT "Income_categoryId_fkey";

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
