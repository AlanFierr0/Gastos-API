import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.expense.deleteMany();
  await prisma.income.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.exchangeRateHistory.deleteMany();
  await prisma.person.deleteMany();
  await prisma.category.deleteMany();
  await prisma.categoryType.deleteMany();

  // (removed unused createDate helper)

  console.log('✅ Seed completed successfully!');
  console.log(`   - Created 7 persons: Familiar, Alan, Lucas, Ale, Walter, Nelly/Hector, Loki`);
  console.log(`   - Created ${await prisma.income.count()} income records`);
  console.log(`   - Created ${await prisma.expense.count()} expense records`);
  console.log(`   - Created ${await prisma.investment.count()} investment records`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
