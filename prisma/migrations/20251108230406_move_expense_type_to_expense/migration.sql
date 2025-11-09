/*
  Warnings:

  - You are about to drop the column `expenseType` on the `Category` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" DROP COLUMN "expenseType";

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "expenseType" "ExpenseType";
