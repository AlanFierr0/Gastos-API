import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getTotalExpenses() {
    const result = await this.prisma.record.aggregate({
      _sum: {
        monto: true,
      },
      _count: true,
    });

    return {
      total: result._sum.monto || 0,
      count: result._count,
    };
  }

  async getExpensesByCategory() {
    const records = await this.prisma.record.groupBy({
      by: ['categoria'],
      _sum: {
        monto: true,
      },
      _count: true,
    });

    return records.map(record => ({
      categoria: record.categoria || 'Sin categoría',
      total: record._sum.monto || 0,
      count: record._count,
    }));
  }

  async getExpensesByMonth() {
    const records = await this.prisma.record.findMany({
      orderBy: { fecha: 'desc' },
    });

    const monthlyData = records.reduce((acc, record) => {
      const month = new Date(record.fecha).toISOString().substring(0, 7);
      if (!acc[month]) {
        acc[month] = { month, total: 0, count: 0 };
      }
      acc[month].total += record.monto;
      acc[month].count += 1;
      return acc;
    }, {});

    return Object.values(monthlyData);
  }

  async getSummary() {
    const [total, byCategory, byMonth] = await Promise.all([
      this.getTotalExpenses(),
      this.getExpensesByCategory(),
      this.getExpensesByMonth(),
    ]);

    return {
      total,
      byCategory,
      byMonth,
    };
  }
}
