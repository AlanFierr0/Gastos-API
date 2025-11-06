import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ExpensesModule } from './expenses/expenses.module';
import { IncomeModule } from './income/income.module';
import { CategoriesModule } from './categories/categories.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { InvestmentsModule } from './investments/investments.module';
import { FAConfigModule } from './fa-config/fa-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    UploadModule,
    AnalyticsModule,
    ExpensesModule,
    IncomeModule,
    CategoriesModule,
    ExchangeRatesModule,
    InvestmentsModule,
    FAConfigModule,
  ],
})
export class AppModule {}
