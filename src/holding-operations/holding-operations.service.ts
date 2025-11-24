import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHoldingOperationDto, OperationType } from './dto/create-holding-operation.dto';

@Injectable()
export class HoldingOperationsService {
  private readonly logger = new Logger(HoldingOperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateHoldingOperationDto) {
    const holding = await this.prisma.holding.findUnique({
      where: { id: createDto.holdingId },
    });

    if (!holding) {
      throw new NotFoundException(`Holding with ID ${createDto.holdingId} not found`);
    }

    let newAmount = holding.currentAmount;
    if (createDto.type === OperationType.COMPRA) {
      newAmount += createDto.amount;
    } else if (createDto.type === OperationType.VENTA) {
      newAmount -= createDto.amount;
      if (newAmount < 0) {
        throw new Error('No se puede vender más de lo que se tiene');
      }
    } else if (createDto.type === OperationType.AJUSTE) {
      newAmount = createDto.amount;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const operation = await tx.holdingOperation.create({
        data: {
          holdingId: createDto.holdingId,
          type: createDto.type,
          amount: createDto.amount,
          price: createDto.price,
          date: createDto.date ? new Date(createDto.date) : new Date(),
          note: createDto.note,
        },
        include: {
          holding: {
            include: {
              person: true,
              category: {
                include: {
                  type: true,
                },
              },
            },
          },
        },
      });

      await tx.holding.update({
        where: { id: createDto.holdingId },
        data: { currentAmount: newAmount },
      });

      return operation;
    });

    this.logger.log(`Created operation ${result.id} for holding ${createDto.holdingId}`);

    return result;
  }

  async findAll(holdingId?: string) {
    const where = holdingId ? { holdingId } : {};
    return this.prisma.holdingOperation.findMany({
      where,
      include: {
        holding: {
          include: {
            person: true,
            category: {
              include: {
                type: true,
              },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const operation = await this.prisma.holdingOperation.findUnique({
      where: { id },
      include: {
        holding: {
          include: {
            person: true,
            category: {
              include: {
                type: true,
              },
            },
          },
        },
      },
    });
    if (!operation) throw new NotFoundException('Holding operation not found');
    return operation;
  }

  async remove(id: string) {
    const operation = await this.findOne(id);
    
    const holding = await this.prisma.holding.findUnique({
      where: { id: operation.holdingId },
    });

    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    let newAmount = holding.currentAmount;
    if (operation.type === OperationType.COMPRA) {
      newAmount -= operation.amount;
    } else if (operation.type === OperationType.VENTA) {
      newAmount += operation.amount;
    } else if (operation.type === OperationType.AJUSTE) {
      // Para ajuste, no podemos revertir fácilmente, así que mantenemos el valor actual
      // O podríamos necesitar un historial más complejo
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.holdingOperation.delete({
        where: { id },
      });

      await tx.holding.update({
        where: { id: operation.holdingId },
        data: { currentAmount: Math.max(0, newAmount) },
      });
    });

    return { id };
  }
}

