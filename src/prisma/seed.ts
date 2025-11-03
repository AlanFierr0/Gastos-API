import { PrismaClient, CategoryType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Categories
  const food = await prisma.category.upsert({
    where: { name: 'Food' },
    update: {},
    create: { name: 'Food', type: 'expense' as CategoryType },
  });
  const transport = await prisma.category.upsert({
    where: { name: 'Transport' },
    update: {},
    create: { name: 'Transport', type: 'expense' as CategoryType },
  });
  await prisma.category.upsert({
    where: { name: 'Salary' },
    update: {},
    create: { name: 'Salary', type: 'income' as CategoryType },
  });

  // Expenses
  await prisma.expense.createMany({
    data: [
      { categoryId: food.id, amount: 25.5, date: new Date(), notes: 'Lunch' },
      { categoryId: transport.id, amount: 10, date: new Date(), notes: 'Bus ticket' },
    ],
    skipDuplicates: true,
  });

  // Incomes
  await prisma.income.createMany({
    data: [
      { source: 'Salary', amount: 1200, date: new Date(), notes: 'Monthly' },
      { source: 'Freelance', amount: 300, date: new Date(), notes: 'Project' },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });


