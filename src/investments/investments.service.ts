import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentDto } from './dto/update-investment.dto';

@Injectable()
export class InvestmentsService {
  constructor(private prisma: PrismaService) {}

  async create(createInvestmentDto: CreateInvestmentDto) {
    return this.prisma.investment.create({
      data: {
        type: createInvestmentDto.type,
        name: createInvestmentDto.name,
        amount: createInvestmentDto.amount,
        value: createInvestmentDto.value,
        currency: createInvestmentDto.currency || 'ARS',
        date: new Date(createInvestmentDto.date),
        notes: createInvestmentDto.notes || undefined,
      },
    });
  }

  async findAll() {
    return this.prisma.investment.findMany({
      orderBy: {
        date: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const investment = await this.prisma.investment.findUnique({
      where: { id },
    });

    if (!investment) {
      throw new NotFoundException(`Investment with ID ${id} not found`);
    }

    return investment;
  }

  async update(id: string, updateInvestmentDto: UpdateInvestmentDto) {
    await this.findOne(id);

    return this.prisma.investment.update({
      where: { id },
      data: {
        ...(updateInvestmentDto.type && { type: updateInvestmentDto.type }),
        ...(updateInvestmentDto.name && { name: updateInvestmentDto.name }),
        ...(updateInvestmentDto.amount !== undefined && { amount: updateInvestmentDto.amount }),
        ...(updateInvestmentDto.value !== undefined && { value: updateInvestmentDto.value }),
        ...(updateInvestmentDto.currency && { currency: updateInvestmentDto.currency }),
        ...(updateInvestmentDto.date && { date: new Date(updateInvestmentDto.date) }),
        ...(updateInvestmentDto.notes !== undefined && { notes: updateInvestmentDto.notes || null }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.investment.delete({
      where: { id },
    });
  }

  async getTotalValue() {
    const investments = await this.prisma.investment.findMany();
    return investments.reduce((total, inv) => total + Number(inv.value || 0), 0);
  }

  async getTotalInvested() {
    const investments = await this.prisma.investment.findMany();
    return investments.reduce((total, inv) => total + Number(inv.amount || 0), 0);
  }

  async getProfit() {
    const totalValue = await this.getTotalValue();
    const totalInvested = await this.getTotalInvested();
    return totalValue - totalInvested;
  }
}

