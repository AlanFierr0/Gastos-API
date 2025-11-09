import { Module } from '@nestjs/common';
import { InvestmentOperationsService } from './investment-operations.service';
import { InvestmentOperationsController } from './investment-operations.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InvestmentOperationsController],
  providers: [InvestmentOperationsService],
  exports: [InvestmentOperationsService],
})
export class InvestmentOperationsModule {}

