import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentDto } from './dto/update-investment.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvestmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const investments = await this.prisma.investment.findMany({
      orderBy: { createdAt: 'desc' },
      include: { 
        category: { include: { type: true } },
        operations: {
          orderBy: { date: 'asc' },
        },
      },
    });

    // Calcular el costo promedio ponderado para cada inversión
    return investments.map(inv => {
      const averageCost = this.calculateAverageCost(inv);
      return {
        ...inv,
        averageCost,
      };
    });
  }

  /**
   * Calcula el costo promedio ponderado basado en todas las compras
   * Incluye la inversión original y todas las operaciones de compra ordenadas por fecha
   */
  private calculateAverageCost(investment: any): number {
    const purchases: Array<{ amount: number; price: number; date: Date }> = [];

    // Agregar la inversión original
    if (investment.originalAmount > 0 && investment.currentAmount > 0) {
      const originalPrice = investment.originalAmount / investment.currentAmount;
      purchases.push({
        amount: investment.currentAmount,
        price: originalPrice,
        date: new Date(investment.date),
      });
    }

    // Agregar todas las compras ordenadas por fecha
    const buyOperations = investment.operations
      ?.filter((op: any) => op.type === 'COMPRA' && op.price && op.price > 0)
      .sort((a: any, b: any) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime()) || [];

    for (const op of buyOperations) {
      purchases.push({
        amount: op.amount,
        price: op.price,
        date: new Date(op.date || op.createdAt),
      });
    }

    if (purchases.length === 0) {
      return 0;
    }

    // Ordenar todas las compras por fecha
    purchases.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calcular costo promedio ponderado de todas las compras
    let totalCost = 0;
    let totalAmount = 0;

    for (const purchase of purchases) {
      totalCost += purchase.amount * purchase.price;
      totalAmount += purchase.amount;
    }

    return totalAmount > 0 ? totalCost / totalAmount : 0;
  }

  async findOne(id: string) {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
      include: { category: { include: { type: true } } },
    });
    if (!investment) throw new NotFoundException('Investment not found');
    return investment;
  }

  async create(dto: CreateInvestmentDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      include: { type: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    
    // Verify that the category type is one of the investment types
    const investmentTypes = ['moneda', 'equity', 'crypto'];
    if (!investmentTypes.includes(category.type.name.toLowerCase())) {
      throw new NotFoundException('Category must be of type "moneda", "equity", or "crypto"');
    }

    const data = {
      categoryId: dto.categoryId,
      concept: dto.concept,
      currentAmount: dto.currentAmount,
      currentPrice: dto.currentPrice,
      tag: dto.tag || null,
      originalAmount: dto.originalAmount,
      date: dto.date ? new Date(dto.date) : new Date(),
      custodyEntity: dto.custodyEntity || null,
    } as unknown as Prisma.InvestmentUncheckedCreateInput;

    return this.prisma.investment.create({
      data,
      include: { category: { include: { type: true } } },
    });
  }

  async update(id: string, dto: UpdateInvestmentDto) {
    await this.findOne(id);
    
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        include: { type: true },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
      
      // Verify that the category type is one of the investment types
      const investmentTypes = ['moneda', 'equity', 'crypto'];
      if (!investmentTypes.includes(category.type.name.toLowerCase())) {
        throw new NotFoundException('Category must be of type "moneda", "equity", or "crypto"');
      }
    }

    const data: Prisma.InvestmentUncheckedUpdateInput = {
      categoryId: dto.categoryId,
      concept: dto.concept,
      currentAmount: dto.currentAmount,
      currentPrice: dto.currentPrice,
      tag: dto.tag,
      originalAmount: dto.originalAmount,
      custodyEntity: dto.custodyEntity,
    };

    if (dto.date !== undefined) {
      data.date = new Date(dto.date);
    }

    return this.prisma.investment.update({
      where: { id },
      data,
      include: { category: { include: { type: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.investment.delete({ where: { id } });
    return { id };
  }
}

