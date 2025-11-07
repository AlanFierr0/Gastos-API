import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

export interface ExchangeRate {
  name: string;
  code: string;
  buy: number;
  sell: number;
  lastUpdate: string;
}

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly DOLLAR_API_URL = 'https://api.bluelytics.com.ar/v2/latest';
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache
  private cache: {
    data: ExchangeRate[];
    timestamp: number;
  } | null = null;

  constructor(private prisma: PrismaService) {}

  async getExchangeRates(): Promise<ExchangeRate[]> {
    // Return cached data if still valid
    if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_DURATION) {
      
      return this.cache.data;
    }

    try {
      const response = await axios.get(this.DOLLAR_API_URL, {
        timeout: 5000,
      });

      const data = response.data;
      const rates: ExchangeRate[] = [];

      // Dólar Oficial
      if (data.oficial) {
        rates.push({
          name: 'Dólar Oficial',
          code: 'USD_OFICIAL',
          buy: data.oficial.value_buy || 0,
          sell: data.oficial.value_sell || 0,
          lastUpdate: data.oficial.last_update || new Date().toISOString(),
        });
      }

      // Dólar Blue
      if (data.blue) {
        rates.push({
          name: 'Dólar Blue',
          code: 'USD_BLUE',
          buy: data.blue.value_buy || 0,
          sell: data.blue.value_sell || 0,
          lastUpdate: data.blue.last_update || new Date().toISOString(),
        });
      }

      // Update cache
      this.cache = {
        data: rates,
        timestamp: Date.now(),
      };

      return rates;
    } catch (error) {
      this.logger.error(`Failed to fetch exchange rates: ${error?.message || error}`);
      
      // Return cached data if available, even if expired
      if (this.cache) {
        
        return this.cache.data;
      }

      // Return default/fallback rates if no cache
      return this.getDefaultRates();
    }
  }

  private getDefaultRates(): ExchangeRate[] {
    return [
      {
        name: 'Dólar Oficial',
        code: 'USD_OFICIAL',
        buy: 0,
        sell: 0,
        lastUpdate: new Date().toISOString(),
      },
      {
        name: 'Dólar Blue',
        code: 'USD_BLUE',
        buy: 0,
        sell: 0,
        lastUpdate: new Date().toISOString(),
      },
    ];
  }

  async convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return amount;
    
    const rates = await this.getExchangeRates();
    
    // Convert to ARS first if needed
    let amountInARS = amount;
    if (fromCurrency === 'USD') {
      const blueRate = rates.find(r => r.code === 'USD_BLUE');
      if (blueRate) {
        amountInARS = amount * blueRate.sell; // Use sell price for conversion
      }
    }

    // Convert from ARS to target currency
    if (toCurrency === 'USD') {
      const blueRate = rates.find(r => r.code === 'USD_BLUE');
      if (blueRate) {
        return amountInARS / blueRate.buy; // Use buy price for conversion
      }
    }

    return amountInARS; // Default: return in ARS
  }
}

