import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getTotalExpenses(currency?: string) {
    const result = await this.prisma.expense.aggregate({
      where: currency ? { currency } : undefined,
      _sum: { amount: true },
      _count: true,
    });
    return { total: result._sum.amount || 0, count: result._count };
  }

  async getTotalIncome(currency?: string) {
    const result = await this.prisma.income.aggregate({ where: currency ? { currency } : undefined, _sum: { amount: true }, _count: true });
    return { total: result._sum.amount || 0, count: result._count };
  }

  async getExpensesByCategory(currency?: string) {
    const byCat = await this.prisma.expense.groupBy({
      where: currency ? { currency } : undefined,
      by: ['categoryId'],
      _sum: { amount: true },
      _count: true,
    });
    const categories = await this.prisma.category.findMany({
      where: { id: { in: byCat.map(x => x.categoryId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map(c => [c.id, c.name] as const));
    return byCat.map(item => ({
      categoria: nameById.get(item.categoryId) || 'Sin categoría',
      total: item._sum.amount || 0,
      count: item._count,
    }));
  }

  async getExpensesByMonth(currency?: string) {
    const expenses = await this.prisma.expense.findMany({ orderBy: { date: 'desc' }, where: currency ? { currency } : undefined });
    const monthlyData = expenses.reduce((acc: Record<string, { month: string; total: number; count: number }>, e) => {
      const month = new Date(e.date).toISOString().substring(0, 7);
      if (!acc[month]) acc[month] = { month, total: 0, count: 0 };
      acc[month].total += e.amount;
      acc[month].count += 1;
      return acc;
    }, {} as Record<string, { month: string; total: number; count: number }>);
    return Object.values(monthlyData);
  }

  async getIncomeByMonth(currency?: string) {
    const incomes = await this.prisma.income.findMany({ orderBy: { date: 'desc' }, where: currency ? { currency } : undefined });
    const monthlyData = incomes.reduce((acc: Record<string, { month: string; total: number; count: number }>, e) => {
      const month = new Date(e.date).toISOString().substring(0, 7);
      if (!acc[month]) acc[month] = { month, total: 0, count: 0 };
      acc[month].total += e.amount;
      acc[month].count += 1;
      return acc;
    }, {} as Record<string, { month: string; total: number; count: number }>);
    return Object.values(monthlyData);
  }

  async getSummary(currency?: string) {
    const [incomeTotal, expenseTotal, expensesByCategory, expensesByMonth, incomeByMonth] = await Promise.all([
      this.getTotalIncome(currency),
      this.getTotalExpenses(currency),
      this.getExpensesByCategory(currency),
      this.getExpensesByMonth(currency),
      this.getIncomeByMonth(currency),
    ]);

    const balance = incomeTotal.total - expenseTotal.total;

    // Percentage by category based on total expenses
    const totalExpensesForPercent = expensesByCategory.reduce((s, c) => s + (c.total || 0), 0) || 1;
    const byCategoryPercent = expensesByCategory.map(c => ({
      categoria: c.categoria,
      total: c.total,
      percent: +(100 * (c.total || 0) / totalExpensesForPercent).toFixed(2),
    }));

    return {
      totals: {
        income: incomeTotal.total,
        expenses: expenseTotal.total,
        balance,
      },
      byMonth: {
        income: incomeByMonth,
        expenses: expensesByMonth,
      },
      byCategory: byCategoryPercent,
    };
  }

  async getExpensesByPerson(currency?: string) {
    const grouped = await this.prisma.expense.groupBy({
      where: currency ? { currency } : undefined,
      by: ['personId'],
      _sum: { amount: true },
      _count: true,
    });
    const personIds = grouped.map(g => g.personId).filter(Boolean) as string[];
    const persons = personIds.length
      ? await this.prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(persons.map(p => [p.id, p.name] as const));
    return grouped.map(g => ({
      personId: g.personId,
      person: g.personId ? (nameById.get(g.personId) || 'Unassigned') : 'Unassigned',
      total: g._sum.amount || 0,
      count: g._count,
    }));
  }
}
