-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('MENSUAL', 'SEMESTRAL', 'ANUAL', 'EXCEPCIONAL');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "expenseType" "ExpenseType";
