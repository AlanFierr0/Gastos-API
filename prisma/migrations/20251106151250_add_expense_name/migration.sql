/*
  Warnings:

  - You are about to drop the column `personId` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `personId` on the `Income` table. All the data in the column will be lost.
  - You are about to drop the column `personId` on the `Investment` table. All the data in the column will be lost.
  - You are about to drop the `Person` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Expense" DROP CONSTRAINT "Expense_personId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Income" DROP CONSTRAINT "Income_personId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Investment" DROP CONSTRAINT "Investment_personId_fkey";

-- DropIndex
DROP INDEX "public"."Investment_personId_idx";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "personId",
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "Income" DROP COLUMN "personId";

-- AlterTable
ALTER TABLE "Investment" DROP COLUMN "personId";

-- DropTable
DROP TABLE "public"."Person";
