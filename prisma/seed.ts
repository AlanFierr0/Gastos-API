import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  

  // Clean existing data
  
  await prisma.expense.deleteMany();
  await prisma.income.deleteMany();
  await prisma.person.deleteMany();
  await prisma.category.deleteMany();
  await prisma.categoryType.deleteMany();

  

  
}

main()
  .catch(() => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
