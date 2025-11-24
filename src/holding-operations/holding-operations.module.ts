import { Module } from '@nestjs/common';
import { HoldingOperationsService } from './holding-operations.service';
import { HoldingOperationsController } from './holding-operations.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HoldingOperationsController],
  providers: [HoldingOperationsService],
})
export class HoldingOperationsModule {}

