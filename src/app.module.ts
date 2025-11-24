import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ExpensesModule } from './expenses/expenses.module';
import { IncomeModule } from './income/income.module';
import { CategoriesModule } from './categories/categories.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { FAConfigModule } from './fa-config/fa-config.module';
import { InvestmentsModule } from './investments/investments.module';
import { PricesModule } from './prices/prices.module';
import { InvestmentOperationsModule } from './investment-operations/investment-operations.module';
import { PersonsModule } from './persons/persons.module';
import { HoldingsModule } from './holdings/holdings.module';
import { HoldingOperationsModule } from './holding-operations/holding-operations.module';

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
    FAConfigModule,
    InvestmentsModule,
    PricesModule,
    InvestmentOperationsModule,
    PersonsModule,
    HoldingsModule,
    HoldingOperationsModule,
  ],
})
export class AppModule {}
