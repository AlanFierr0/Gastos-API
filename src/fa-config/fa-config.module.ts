import { Module } from '@nestjs/common';
import { FAConfigController } from './fa-config.controller';
import { FAConfigService } from './fa-config.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FAConfigController],
  providers: [FAConfigService],
  exports: [FAConfigService],
})
export class FAConfigModule {}

