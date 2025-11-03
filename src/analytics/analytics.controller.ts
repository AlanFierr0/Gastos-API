import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('total')
  getTotalExpenses() {
    return this.analyticsService.getTotalExpenses();
  }

  @Get('by-category')
  getExpensesByCategory() {
    return this.analyticsService.getExpensesByCategory();
  }

  @Get('by-month')
  getExpensesByMonth() {
    return this.analyticsService.getExpensesByMonth();
  }

  @Get('summary')
  getSummary() {
    return this.analyticsService.getSummary();
  }
}
