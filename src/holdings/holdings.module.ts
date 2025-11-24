import { Module } from '@nestjs/common';
import { HoldingsService } from './holdings.service';
import { HoldingsController } from './holdings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HoldingsController],
  providers: [HoldingsService],
})
export class HoldingsModule {}

