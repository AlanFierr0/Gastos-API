import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('total')
  getTotalExpenses(@Query('currency') currency?: string) {
    return this.analyticsService.getTotalExpenses(currency?.toUpperCase());
  }

  @Get('by-category')
  getExpensesByCategory(@Query('currency') currency?: string) {
    return this.analyticsService.getExpensesByCategory(currency?.toUpperCase());
  }

  @Get('by-month')
  getExpensesByMonth(@Query('currency') currency?: string) {
    return this.analyticsService.getExpensesByMonth(currency?.toUpperCase());
  }

  @Get('summary')
  getSummary(@Query('currency') currency?: string) {
    return this.analyticsService.getSummary(currency?.toUpperCase());
  }
}
