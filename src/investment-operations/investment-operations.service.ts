import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvestmentOperationDto, OperationType } from './dto/create-investment-operation.dto';
import { UpdateInvestmentOperationDto } from './dto/update-investment-operation.dto';

@Injectable()
export class InvestmentOperationsService {
  private readonly logger = new Logger(InvestmentOperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateInvestmentOperationDto) {
    // Verificar que la inversión existe
    const investment = await this.prisma.investment.findUnique({
      where: { id: createDto.investmentId },
    });

    if (!investment) {
      throw new NotFoundException(`Investment with ID ${createDto.investmentId} not found`);
    }

    // Calcular la nueva cantidad basada en el tipo de operación
    let newAmount = investment.currentAmount;
    if (createDto.type === OperationType.COMPRA) {
      newAmount += createDto.amount;
    } else if (createDto.type === OperationType.VENTA) {
      newAmount -= createDto.amount;
      if (newAmount < 0) {
        throw new Error('No se puede vender más de lo que se tiene');
      }
    } else if (createDto.type === OperationType.AJUSTE) {
      newAmount = createDto.amount; // En ajuste, se establece directamente la cantidad
    }

    // Crear la operación y actualizar la inversión en una transacción
    const result = await this.prisma.$transaction(async (tx) => {
      // Crear la operación
      const operation = await tx.investmentOperation.create({
        data: {
          investmentId: createDto.investmentId,
          type: createDto.type,
          amount: createDto.amount,
          price: createDto.price,
          note: createDto.note,
        },
        include: {
          investment: {
            include: {
              category: {
                include: {
                  type: true,
                },
              },
            },
          },
        },
      });

      // Actualizar la cantidad actual de la inversión
      await tx.investment.update({
        where: { id: createDto.investmentId },
        data: { currentAmount: newAmount },
      });

      return operation;
    });

    this.logger.log(`Created operation ${result.id} for investment ${createDto.investmentId}`);

    return result;
  }

  async findAll(investmentId?: string) {
    const where = investmentId ? { investmentId } : {};
    return this.prisma.investmentOperation.findMany({
      where,
      include: {
        investment: {
          include: {
            category: {
              include: {
                type: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const operation = await this.prisma.investmentOperation.findUnique({
      where: { id },
      include: {
        investment: {
          include: {
            category: {
              include: {
                type: true,
              },
            },
          },
        },
      },
    });

    if (!operation) {
      throw new NotFoundException(`InvestmentOperation with ID ${id} not found`);
    }

    return operation;
  }

  async update(id: string, updateDto: UpdateInvestmentOperationDto) {
    const operation = await this.findOne(id);

    // Si se actualiza el amount o type, necesitamos recalcular la cantidad de la inversión
    if (updateDto.amount !== undefined || updateDto.type !== undefined) {
      // Obtener todas las operaciones de esta inversión
      const allOperations = await this.prisma.investmentOperation.findMany({
        where: { investmentId: operation.investmentId },
        orderBy: { createdAt: 'asc' },
      });

      // Obtener la inversión original
      const investment = await this.prisma.investment.findUnique({
        where: { id: operation.investmentId },
      });

      // Recalcular desde el originalAmount
      let newAmount = investment.originalAmount;
      for (const op of allOperations) {
        const opAmount = op.id === id ? (updateDto.amount ?? op.amount) : op.amount;
        const opType = op.id === id ? (updateDto.type ?? op.type) : op.type;

        if (opType === OperationType.COMPRA) {
          newAmount += opAmount;
        } else if (opType === OperationType.VENTA) {
          newAmount -= opAmount;
        } else if (opType === OperationType.AJUSTE) {
          newAmount = opAmount;
        }
      }

      // Actualizar en transacción
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.investmentOperation.update({
          where: { id },
          data: updateDto,
        });

        await tx.investment.update({
          where: { id: operation.investmentId },
          data: { currentAmount: newAmount },
        });

        return updated;
      });
    }

    return this.prisma.investmentOperation.update({
      where: { id },
      data: updateDto,
    });
  }

  async remove(id: string) {
    const operation = await this.findOne(id);

    // Recalcular la cantidad de la inversión sin esta operación
    const allOperations = await this.prisma.investmentOperation.findMany({
      where: { investmentId: operation.investmentId },
      orderBy: { createdAt: 'asc' },
    });

    const investment = await this.prisma.investment.findUnique({
      where: { id: operation.investmentId },
    });

    let newAmount = investment.originalAmount;
    for (const op of allOperations) {
      if (op.id === id) continue; // Saltar la operación que se va a eliminar

      if (op.type === OperationType.COMPRA) {
        newAmount += op.amount;
      } else if (op.type === OperationType.VENTA) {
        newAmount -= op.amount;
      } else if (op.type === OperationType.AJUSTE) {
        newAmount = op.amount;
      }
    }

    // Eliminar y actualizar en transacción
    return this.prisma.$transaction(async (tx) => {
      await tx.investmentOperation.delete({
        where: { id },
      });

      await tx.investment.update({
        where: { id: operation.investmentId },
        data: { currentAmount: newAmount },
      });
    });
  }
}

