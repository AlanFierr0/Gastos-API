import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ExchangeRatesService, ExchangeRate } from './exchange-rates.service';

@ApiTags('exchange-rates')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current exchange rates (USD Official, Blue)' })
  @ApiResponse({ status: 200, description: 'Exchange rates retrieved successfully' })
  async getExchangeRates(): Promise<ExchangeRate[]> {
    return this.exchangeRatesService.getExchangeRates();
  }
}

