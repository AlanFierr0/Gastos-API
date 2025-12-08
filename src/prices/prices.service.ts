import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 1000; // 1 segundo
  
  // Lock para evitar múltiples actualizaciones simultáneas
  private updateLock = false;
  private lastUpdateTime = 0;
  private readonly MIN_UPDATE_INTERVAL = 300000; // Mínimo 5 minutos (300000ms) entre actualizaciones manuales
  
  // Límites para evitar rate limiting de las APIs
  // CoinGecko: permite hasta 250 IDs por request, pero solo ~50 requests/minuto (free tier)
  // Yahoo Finance: no tiene límite oficial pero es muy restrictivo con rate limiting
  // Estos límites aseguran que no se alcance el rate limit incluso con muchas inversiones
  private readonly MAX_CRYPTO_SYMBOLS = 50; // Conservador: permite múltiples batches sin problemas
  private readonly MAX_EQUITY_SYMBOLS = 30; // Conservador: Yahoo Finance es más restrictivo

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene los símbolos únicos de crypto y equity desde las inversiones
   * Prioriza símbolos con inversiones más recientes y con mayor cantidad
   * Limita la cantidad para evitar rate limiting
   */
  async getSymbolsFromInvestments() {
    console.log('[PricesService] getSymbolsFromInvestments called');
    this.logger.log('Getting symbols from investments...');
    
    try {
      const investments = await this.prisma.investment.findMany({
        include: {
          category: {
            include: {
              type: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc', // Ordenar por fecha de actualización (más recientes primero)
        },
      });

      console.log(`[PricesService] Found ${investments.length} investments`);
      this.logger.log(`Found ${investments.length} investments`);

      // Usar Map para rastrear símbolos con información de prioridad
      const cryptoMap = new Map<string, { count: number; lastUpdate: Date; totalAmount: number }>();
      const equityMap = new Map<string, { count: number; lastUpdate: Date; totalAmount: number }>();

      investments.forEach((inv) => {
        const concept = inv.concept?.toUpperCase().trim();
        if (!concept) {
          this.logger.debug(`Investment ${inv.id} has no concept, skipping`);
          return;
        }

        const typeName = inv.category?.type?.name?.toLowerCase();
        if (typeName === 'crypto') {
          const existing = cryptoMap.get(concept) || { count: 0, lastUpdate: inv.updatedAt, totalAmount: 0 };
          cryptoMap.set(concept, {
            count: existing.count + 1,
            lastUpdate: inv.updatedAt > existing.lastUpdate ? inv.updatedAt : existing.lastUpdate,
            totalAmount: existing.totalAmount + (inv.currentAmount || 0),
          });
          this.logger.debug(`Found crypto investment: ${concept} (ID: ${inv.id})`);
        } else if (typeName === 'equity') {
          const existing = equityMap.get(concept) || { count: 0, lastUpdate: inv.updatedAt, totalAmount: 0 };
          equityMap.set(concept, {
            count: existing.count + 1,
            lastUpdate: inv.updatedAt > existing.lastUpdate ? inv.updatedAt : existing.lastUpdate,
            totalAmount: existing.totalAmount + (inv.currentAmount || 0),
          });
          this.logger.debug(`Found equity investment: ${concept} (ID: ${inv.id})`);
        } else {
          this.logger.debug(`Investment ${inv.id} (${concept}) has type ${typeName}, skipping`);
        }
      });

      // Convertir a arrays y ordenar por prioridad (más recientes y con mayor cantidad primero)
      const cryptoArray = Array.from(cryptoMap.entries())
        .sort((a, b) => {
          // Priorizar por fecha de actualización (más reciente primero)
          const dateDiff = b[1].lastUpdate.getTime() - a[1].lastUpdate.getTime();
          if (Math.abs(dateDiff) > 86400000) { // Si la diferencia es más de 1 día, usar fecha
            return dateDiff;
          }
          // Si las fechas son similares, priorizar por cantidad total
          return b[1].totalAmount - a[1].totalAmount;
        })
        .map(([symbol]) => symbol);

      const equityArray = Array.from(equityMap.entries())
        .sort((a, b) => {
          // Priorizar por fecha de actualización (más reciente primero)
          const dateDiff = b[1].lastUpdate.getTime() - a[1].lastUpdate.getTime();
          if (Math.abs(dateDiff) > 86400000) { // Si la diferencia es más de 1 día, usar fecha
            return dateDiff;
          }
          // Si las fechas son similares, priorizar por cantidad total
          return b[1].totalAmount - a[1].totalAmount;
        })
        .map(([symbol]) => symbol);

      // Aplicar límites
      const limitedCrypto = cryptoArray.slice(0, this.MAX_CRYPTO_SYMBOLS);
      const limitedEquity = equityArray.slice(0, this.MAX_EQUITY_SYMBOLS);

      if (cryptoArray.length > this.MAX_CRYPTO_SYMBOLS) {
        const skipped = cryptoArray.length - this.MAX_CRYPTO_SYMBOLS;
        const skippedSymbols = cryptoArray.slice(this.MAX_CRYPTO_SYMBOLS);
        console.log(`[PricesService] Limiting crypto symbols: ${cryptoArray.length} -> ${limitedCrypto.length}, skipped ${skipped} symbols`);
        this.logger.warn(`Limiting crypto symbols to ${this.MAX_CRYPTO_SYMBOLS} (skipped ${skipped}): ${skippedSymbols.join(', ')}`);
      }

      if (equityArray.length > this.MAX_EQUITY_SYMBOLS) {
        const skipped = equityArray.length - this.MAX_EQUITY_SYMBOLS;
        const skippedSymbols = equityArray.slice(this.MAX_EQUITY_SYMBOLS);
        console.log(`[PricesService] Limiting equity symbols: ${equityArray.length} -> ${limitedEquity.length}, skipped ${skipped} symbols`);
        this.logger.warn(`Limiting equity symbols to ${this.MAX_EQUITY_SYMBOLS} (skipped ${skipped}): ${skippedSymbols.join(', ')}`);
      }
      
      console.log(`[PricesService] Extracted ${limitedCrypto.length} crypto symbols (of ${cryptoArray.length} total): ${limitedCrypto.join(', ')}`);
      console.log(`[PricesService] Extracted ${limitedEquity.length} equity symbols (of ${equityArray.length} total): ${limitedEquity.join(', ')}`);
      this.logger.log(`Extracted ${limitedCrypto.length} crypto symbols from investments (${cryptoArray.length} total): ${limitedCrypto.join(', ')}`);
      this.logger.log(`Extracted ${limitedEquity.length} equity symbols from investments (${equityArray.length} total): ${limitedEquity.join(', ')}`);

      return {
        crypto: limitedCrypto,
        equity: limitedEquity,
      };
    } catch (error) {
      console.error('[PricesService] Error in getSymbolsFromInvestments:', error);
      this.logger.error(`Error in getSymbolsFromInvestments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene precios de cryptos desde CoinGecko
   */
  async fetchCryptoPrices(symbols: string[]): Promise<Map<string, number>> {
    if (symbols.length === 0) {
      this.logger.debug('No crypto symbols to fetch');
      return new Map();
    }

    this.logger.log(`Fetching prices for ${symbols.length} crypto symbols: ${symbols.join(', ')}`);
    const prices = new Map<string, number>();

    try {
      // Mapeo de símbolos comunes a IDs de CoinGecko
      // Si el símbolo no está en el mapeo, se intenta usar el símbolo en minúsculas como ID
      const symbolToId: Record<string, string> = {
        BTC: 'bitcoin',
        ETH: 'ethereum',
        BNB: 'binancecoin',
        SOL: 'solana',
        ADA: 'cardano',
        XRP: 'ripple',
        DOGE: 'dogecoin',
        DOT: 'polkadot',
        MATIC: 'matic-network',
        AVAX: 'avalanche-2',
        LINK: 'chainlink',
        UNI: 'uniswap',
        LTC: 'litecoin',
        ATOM: 'cosmos',
        ETC: 'ethereum-classic',
        XLM: 'stellar',
        ALGO: 'algorand',
        VET: 'vechain',
        FIL: 'filecoin',
        TRX: 'tron',
        USDT: 'tether',
        USDC: 'usd-coin',
        DAI: 'dai',
        BUSD: 'binance-usd',
        SHIB: 'shiba-inu',
        AAVE: 'aave',
        MKR: 'maker',
        COMP: 'compound-governance-token',
        SNX: 'havven',
        CRV: 'curve-dao-token',
        YFI: 'yearn-finance',
        SUSHI: 'sushi',
        // Agregar más según necesidad
      };

      const ids: string[] = [];
      const symbolMap = new Map<string, string>(); // CoinGecko ID -> Symbol

      symbols.forEach((symbol) => {
        const id = symbolToId[symbol] || symbol.toLowerCase();
        ids.push(id);
        symbolMap.set(id, symbol);
        if (symbolToId[symbol]) {
          this.logger.debug(`Crypto symbol ${symbol} mapped to CoinGecko ID: ${id}`);
        } else {
          this.logger.debug(`Crypto symbol ${symbol} using lowercase as CoinGecko ID: ${id}`);
        }
      });

      this.logger.log(`CoinGecko IDs to fetch: ${ids.join(', ')}`);

      if (ids.length === 0) return prices;

      // CoinGecko permite hasta 250 IDs por request
      const batchSize = 250;
      const maxRetries = 3;
      
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const idsParam = batch.join(',');
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;

        this.logger.log(`CoinGecko API call - Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} IDs - URL: ${url}`);

        let retryCount = 0;
        let batchSuccess = false;

        while (retryCount <= maxRetries && !batchSuccess) {
          try {
            const response = await fetch(url);
            
            if (!response.ok) {
              if (response.status === 429) {
                // Rate limiting - esperar más tiempo con backoff exponencial
                const waitTime = Math.min(5000 * Math.pow(2, retryCount), 30000); // Máximo 30 segundos
                this.logger.warn(`Rate limit hit for crypto prices batch ${i / batchSize + 1}, waiting ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries + 1})...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                retryCount++;
                continue; // Reintentar este batch
              }
              
              // Otros errores HTTP
              if (retryCount < maxRetries) {
                const waitTime = 2000 * (retryCount + 1);
                this.logger.warn(`Error fetching crypto prices (${response.status}): ${response.statusText}, retrying in ${waitTime}ms...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                retryCount++;
                continue; // Reintentar este batch
              } else {
                this.logger.error(`Error fetching crypto prices after ${maxRetries + 1} attempts: ${response.statusText}`);
                break; // Salir del loop de reintentos para este batch
              }
            }

            // Si la respuesta es exitosa, procesar los datos
            const data = await response.json();

            this.logger.debug(`CoinGecko response for batch ${Math.floor(i / batchSize) + 1}: ${JSON.stringify(Object.keys(data))}`);

            for (const [id, priceData] of Object.entries(data)) {
              const symbol = symbolMap.get(id);
              if (symbol && priceData && typeof priceData === 'object' && 'usd' in priceData) {
                const price = Number(priceData.usd);
                prices.set(symbol, price);
                this.logger.debug(`CoinGecko price for ${symbol} (${id}): $${price}`);
              } else if (!symbol) {
                this.logger.warn(`CoinGecko returned price for unknown ID: ${id}`);
              }
            }

            batchSuccess = true; // Marcar como exitoso para salir del loop de reintentos
            this.logger.debug(`Successfully fetched batch ${Math.floor(i / batchSize) + 1}, got ${Object.keys(data).length} prices`);

            // Rate limiting: CoinGecko permite 10-50 requests/minuto
            if (i + batchSize < ids.length) {
              await new Promise((resolve) => setTimeout(resolve, 1200)); // ~1.2 segundos entre requests
            }
          } catch (error) {
            if (retryCount < maxRetries) {
              const waitTime = 2000 * (retryCount + 1);
              this.logger.warn(`Error fetching crypto batch (attempt ${retryCount + 1}/${maxRetries + 1}): ${error.message}, retrying in ${waitTime}ms...`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              retryCount++;
            } else {
              this.logger.error(`Error fetching crypto batch after ${maxRetries + 1} attempts: ${error.message}`);
              break; // Salir del loop de reintentos para este batch
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error in fetchCryptoPrices: ${error.message}`);
    }

    this.logger.log(`Successfully fetched ${prices.size} out of ${symbols.length} crypto prices`);
    return prices;
  }

  /**
   * Obtiene precios de equities desde Yahoo Finance
   */
  async fetchEquityPrices(symbols: string[]): Promise<Map<string, number>> {
    if (symbols.length === 0) {
      this.logger.debug('No equity symbols to fetch');
      return new Map();
    }

    this.logger.log(`Fetching prices for ${symbols.length} equity symbols: ${symbols.join(', ')}`);
    const prices = new Map<string, number>();

    try {
      // Procesar en batches para evitar rate limiting
      const batchSize = 10;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        this.logger.log(`Yahoo Finance API call - Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} symbols - ${batch.join(', ')}`);

        await Promise.all(
          batch.map(async (symbol) => {
            try {
              const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
              this.logger.debug(`Yahoo Finance API call for ${symbol}: ${url}`);
              const response = await fetch(url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
              });

              if (!response.ok) {
                if (response.status === 429) {
                  // Rate limiting - esperar más tiempo
                  this.logger.warn(`Rate limit hit for equity ${symbol}, waiting...`);
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  return;
                }
                this.logger.warn(`Error fetching equity price for ${symbol}: ${response.statusText}`);
                return;
              }

              const data = await response.json();
              const result = data?.chart?.result?.[0];

              if (result?.meta?.regularMarketPrice) {
                const price = Number(result.meta.regularMarketPrice);
                if (!isNaN(price) && price > 0) {
                  prices.set(symbol, price);
                  this.logger.debug(`Yahoo Finance price for ${symbol}: $${price}`);
                } else {
                  this.logger.warn(`Invalid price data for ${symbol}: ${result.meta.regularMarketPrice}`);
                }
              } else {
                this.logger.warn(`No price data found for ${symbol} - Response: ${JSON.stringify(data?.chart?.result?.[0]?.meta || {})}`);
              }
            } catch (error) {
              this.logger.error(`Error fetching equity price for ${symbol}: ${error.message}`);
            }
          })
        );

        // Rate limiting: esperar entre batches
        if (i + batchSize < symbols.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      this.logger.error(`Error in fetchEquityPrices: ${error.message}`);
    }

    this.logger.log(`Successfully fetched ${prices.size} out of ${symbols.length} equity prices`);
    return prices;
  }

  /**
   * Guarda o actualiza precios en la base de datos
   */
  async savePrices(
    cryptoPrices: Map<string, number>,
    equityPrices: Map<string, number>
  ): Promise<{ saved: number; errors: number }> {
    let saved = 0;
    let errors = 0;

    this.logger.log(`Saving ${cryptoPrices.size} crypto prices and ${equityPrices.size} equity prices to database`);

    // Guardar precios de crypto
    for (const [symbol, price] of cryptoPrices.entries()) {
      try {
        const normalizedSymbol = symbol.toUpperCase().trim();
        await this.prisma.price.upsert({
          where: { symbol: normalizedSymbol },
          update: {
            price,
            type: 'crypto',
            source: 'coingecko',
            updatedAt: new Date(),
          },
          create: {
            symbol: normalizedSymbol,
            price,
            type: 'crypto',
            source: 'coingecko',
          },
        });
        this.logger.log(`Saved crypto price for ${normalizedSymbol}: $${price}`);
        saved++;
      } catch (error) {
        this.logger.error(`Error saving crypto price for ${symbol}: ${error.message}`);
        errors++;
      }
    }

    // Guardar precios de equity
    for (const [symbol, price] of equityPrices.entries()) {
      try {
        const normalizedSymbol = symbol.toUpperCase().trim();
        await this.prisma.price.upsert({
          where: { symbol: normalizedSymbol },
          update: {
            price,
            type: 'equity',
            source: 'yahoo',
            updatedAt: new Date(),
          },
          create: {
            symbol: normalizedSymbol,
            price,
            type: 'equity',
            source: 'yahoo',
          },
        });
        this.logger.log(`Saved equity price for ${normalizedSymbol}: $${price}`);
        saved++;
      } catch (error) {
        this.logger.error(`Error saving equity price for ${symbol}: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`Price save completed: ${saved} saved successfully, ${errors} errors`);
    return { saved, errors };
  }

  /**
   * Actualiza todos los precios desde las APIs
   * Con protección contra múltiples llamadas simultáneas y rate limiting
   */
  async updateAllPrices(forceUpdate = false): Promise<{ saved: number; errors: number; crypto: number; equity: number; investmentsUpdated: number }> {
    console.log('[PricesService] updateAllPrices called, forceUpdate:', forceUpdate);
    this.logger.log(`[PricesService] updateAllPrices called, forceUpdate: ${forceUpdate}`);
    
    // Prevenir múltiples actualizaciones simultáneas
    if (this.updateLock) {
      console.log('[PricesService] Update lock is active, skipping...');
      this.logger.warn('Price update already in progress, skipping...');
      throw new Error('Price update already in progress');
    }

    // Verificar intervalo mínimo entre actualizaciones (5 minutos)
    // Pero permitir forzar actualización para actualizaciones automáticas
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    console.log(`[PricesService] Time since last update: ${Math.ceil(timeSinceLastUpdate / 1000)}s, MIN_UPDATE_INTERVAL: ${this.MIN_UPDATE_INTERVAL}ms`);
    
    if (!forceUpdate && timeSinceLastUpdate < this.MIN_UPDATE_INTERVAL) {
      const secondsRemaining = Math.ceil((this.MIN_UPDATE_INTERVAL - timeSinceLastUpdate) / 1000);
      const minutesRemaining = Math.ceil(secondsRemaining / 60);
      console.log(`[PricesService] Update called too soon, need to wait ${minutesRemaining} minute(s)`);
      this.logger.warn(`Price update called too soon (${Math.ceil(timeSinceLastUpdate / 1000)}s ago), skipping...`);
      // Para actualizaciones automáticas, retornar silenciosamente en lugar de lanzar error
      // Esto permite que se mantengan los precios anteriores
      return {
        saved: 0,
        errors: 0,
        crypto: 0,
        equity: 0,
        investmentsUpdated: 0,
      };
    }
    
    console.log('[PricesService] Proceeding with price update...');

    this.updateLock = true;
    this.lastUpdateTime = now;

    try {
      console.log('[PricesService] Starting price update...');
      this.logger.log('Starting price update...');

      console.log('[PricesService] Getting symbols from investments...');
      const { crypto: cryptoSymbols, equity: equitySymbols } = await this.getSymbolsFromInvestments();
      console.log(`[PricesService] Got ${cryptoSymbols.length} crypto and ${equitySymbols.length} equity symbols`);

      // Siempre incluir GBP/USD en la actualización de precios
      const equitySymbolsWithGbp = new Set(equitySymbols);
      equitySymbolsWithGbp.add('GBPUSD=X');
      equitySymbolsWithGbp.add('GBPUSD');
      equitySymbolsWithGbp.add('GBP=X');

      this.logger.log(`Found ${cryptoSymbols.length} crypto symbols and ${equitySymbols.length} equity symbols`);
      if (cryptoSymbols.length > 0) {
        this.logger.log(`Crypto symbols: ${cryptoSymbols.join(', ')}`);
      }

      const [cryptoPrices, equityPrices] = await Promise.all([
        this.fetchCryptoPrices(cryptoSymbols),
        this.fetchEquityPrices(Array.from(equitySymbolsWithGbp)),
      ]);

      this.logger.log(`Fetched ${cryptoPrices.size} crypto prices and ${equityPrices.size} equity prices`);
      if (cryptoSymbols.length > 0 && cryptoPrices.size < cryptoSymbols.length) {
        const missingSymbols = cryptoSymbols.filter(s => !cryptoPrices.has(s));
        this.logger.warn(`Missing prices for ${missingSymbols.length} crypto symbols: ${missingSymbols.join(', ')}`);
      }

      const { saved, errors } = await this.savePrices(cryptoPrices, equityPrices);

      this.logger.log(`Price update completed: ${saved} saved, ${errors} errors`);

      // Actualizar automáticamente los precios de las inversiones
      this.logger.log('Updating investment prices...');
      const { updated: investmentsUpdated } = await this.updateInvestmentPrices();
      this.logger.log(`Updated ${investmentsUpdated} investment prices`);

      return {
        saved,
        errors,
        crypto: cryptoPrices.size,
        equity: equityPrices.size,
        investmentsUpdated,
      };
    } catch (error) {
      this.logger.error(`Error in updateAllPrices: ${error.message}`);
      throw error;
    } finally {
      this.updateLock = false;
    }
  }

  /**
   * Obtiene el precio actual de un símbolo
   * Si no está en la base de datos, intenta obtenerlo desde la API
   * Con caché en memoria y manejo de rate limiting
   */
  async getPrice(symbol: string, retryCount = 0, forceRefresh = false): Promise<number | null> {
    const normalizedSymbol = symbol.toUpperCase();
    
    // Siempre leer de la base de datos primero (sin caché en memoria)
    const price = await this.prisma.price.findUnique({
      where: { symbol: normalizedSymbol },
    });

    // Si existe en BD y no se fuerza refresh, retornar el precio de BD
    if (price?.price && !forceRefresh) {
      return price.price;
    }
    
    // Si se fuerza refresh o no existe en BD, obtener desde API

    // Si no está en la base de datos, intentar obtenerlo desde la API con retry
    try {
      // Determinar si es crypto o equity basado en el símbolo
      // Los símbolos de tipo de cambio como GBPUSD=X son equity
      const isCrypto = !normalizedSymbol.includes('=') && !normalizedSymbol.includes('.');
      
      let fetchedPrice: number | null = null;
      
      try {
        if (isCrypto) {
          this.logger.log(`Fetching individual crypto price for symbol: ${normalizedSymbol}`);
          const cryptoPrices = await this.fetchCryptoPrices([normalizedSymbol]);
          fetchedPrice = cryptoPrices.get(normalizedSymbol) || null;
          if (fetchedPrice) {
            this.logger.log(`Got crypto price for ${normalizedSymbol}: $${fetchedPrice}`);
          } else {
            this.logger.warn(`No crypto price found for ${normalizedSymbol}`);
          }
        } else {
          this.logger.log(`Fetching individual equity price for symbol: ${normalizedSymbol}`);
          const equityPrices = await this.fetchEquityPrices([normalizedSymbol]);
          fetchedPrice = equityPrices.get(normalizedSymbol) || null;
          if (fetchedPrice) {
            this.logger.log(`Got equity price for ${normalizedSymbol}: $${fetchedPrice}`);
          } else {
            this.logger.warn(`No equity price found for ${normalizedSymbol}`);
          }
        }
      } catch (apiError: any) {
        // Manejar errores de rate limiting
        if (apiError.message?.includes('Too many requests') || 
            apiError.message?.includes('rate limit') ||
            apiError.status === 429) {
          
          if (retryCount < this.MAX_RETRIES) {
            const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, retryCount); // Backoff exponencial
            this.logger.warn(`Rate limit hit for ${normalizedSymbol}, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.getPrice(symbol, retryCount + 1);
          } else {
            this.logger.error(`Max retries reached for ${normalizedSymbol} due to rate limiting`);
            return null;
          }
        }
        throw apiError;
      }

      // Si se obtuvo el precio, guardarlo en la base de datos y caché
      if (fetchedPrice && fetchedPrice > 0) {
        try {
          await this.prisma.price.upsert({
            where: { symbol: normalizedSymbol },
            update: { 
              price: fetchedPrice,
              type: isCrypto ? 'crypto' : 'equity',
              source: isCrypto ? 'CoinGecko' : 'Yahoo Finance',
            },
            create: {
              symbol: normalizedSymbol,
              price: fetchedPrice,
              type: isCrypto ? 'crypto' : 'equity',
              source: isCrypto ? 'CoinGecko' : 'Yahoo Finance',
            },
          });
        } catch (error) {
          this.logger.error(`Error saving price for ${normalizedSymbol}: ${error.message}`);
        }
      }

      return fetchedPrice;
    } catch (error: any) {
      this.logger.error(`Error fetching price for ${normalizedSymbol} from API: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtiene todos los precios
   */
  async getAllPrices() {
    return this.prisma.price.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Busca símbolos de crypto desde CoinGecko basado en un query
   */
  async searchCryptoSymbols(query: string): Promise<string[]> {
    if (!query || query.length < 1) {
      return [];
    }

    try {
      const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        this.logger.error(`Error searching crypto symbols: ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const coins = data?.coins || [];
      
      // Obtener símbolos únicos (usar symbol en mayúsculas)
      const symbols = new Set<string>();
      coins.slice(0, 20).forEach((coin: any) => {
        if (coin.symbol) {
          symbols.add(coin.symbol.toUpperCase());
        }
      });

      return Array.from(symbols).sort();
    } catch (error) {
      this.logger.error(`Error in searchCryptoSymbols: ${error.message}`);
      return [];
    }
  }

  /**
   * Busca símbolos de equity basado en un query
   * Usa una lista amplia de símbolos comunes de acciones
   */
  async searchEquitySymbols(query: string): Promise<string[]> {
    if (!query || query.length < 1) {
      return [];
    }

    try {
      // Lista amplia de símbolos comunes de acciones (NYSE, NASDAQ)
      const commonEquities = [
        // Tech
        'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'AMD', 'INTC', 'TSLA',
        'NFLX', 'ADBE', 'CRM', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO', 'TXN', 'MU',
        // Finance
        'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'V', 'MA', 'AXP', 'PYPL',
        // Consumer
        'WMT', 'TGT', 'COST', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'DIS', 'NKE',
        // Healthcare
        'JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD',
        // Energy
        'XOM', 'CVX', 'SLB', 'EOG', 'COP', 'MPC', 'VLO', 'PSX', 'HAL', 'OXY',
        // Industrial
        'BA', 'CAT', 'GE', 'HON', 'RTX', 'LMT', 'NOC', 'GD', 'DE', 'EMR',
        // Telecom
        'VZ', 'T', 'TMUS', 'LUMN', 'USM', 'SHEN', 'CNSL', 'ATUS', 'ANET', 'CIEN',
        // Utilities
        'NEE', 'DUK', 'SO', 'AEP', 'SRE', 'EXC', 'XEL', 'PEG', 'WEC', 'ES',
        // Materials
        'LIN', 'APD', 'SHW', 'ECL', 'PPG', 'DD', 'DOW', 'FCX', 'NEM', 'VALE',
        // Real Estate
        'AMT', 'PLD', 'EQIX', 'PSA', 'WELL', 'SPG', 'O', 'DLR', 'EXPI', 'CBRE',
        // Other
        'PG', 'KO', 'PEP', 'PM', 'MO', 'CL', 'EL', 'UL', 'NVS', 'ASML'
      ];

      const queryUpper = query.toUpperCase();
      const matching = commonEquities.filter(symbol => 
        symbol.includes(queryUpper) || symbol.startsWith(queryUpper)
      );

      return matching.slice(0, 20);
    } catch (error) {
      this.logger.error(`Error in searchEquitySymbols: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene símbolos disponibles por tipo (crypto o equity)
   * Si se proporciona un query, busca en APIs externas
   * Si no, devuelve símbolos de inversiones existentes y de la tabla de precios
   */
  async getAvailableSymbols(type: string, query?: string): Promise<string[]> {
    const normalizedType = type.toLowerCase();
    if (normalizedType !== 'crypto' && normalizedType !== 'equity') {
      this.logger.warn(`Invalid type requested for getAvailableSymbols: ${type}`);
      return [];
    }

    // Si hay un query, buscar en APIs externas
    if (query && query.trim().length > 0) {
      if (normalizedType === 'crypto') {
        return await this.searchCryptoSymbols(query.trim());
      } else if (normalizedType === 'equity') {
        return await this.searchEquitySymbols(query.trim());
      }
    }

    // Si no hay query, devolver símbolos de la base de datos
    const symbols = new Set<string>();

    // Obtener símbolos de inversiones existentes
    const { crypto: cryptoSymbols, equity: equitySymbols } = await this.getSymbolsFromInvestments();
    this.logger.debug(`Found ${cryptoSymbols.length} crypto symbols and ${equitySymbols.length} equity symbols from investments`);
    
    if (normalizedType === 'crypto') {
      cryptoSymbols.forEach(s => symbols.add(s));
    } else if (normalizedType === 'equity') {
      equitySymbols.forEach(s => symbols.add(s));
    }

    // Obtener símbolos de la tabla de precios
    const prices = await this.prisma.price.findMany({
      where: { type: normalizedType },
      select: { symbol: true },
    });
    this.logger.debug(`Found ${prices.length} prices in database for type ${normalizedType}`);
    prices.forEach(p => symbols.add(p.symbol.toUpperCase()));

    const result = Array.from(symbols).sort();
    this.logger.log(`Returning ${result.length} available symbols for type ${normalizedType}`);
    return result;
  }

  /**
   * Actualiza el precio actual de una inversión basado en el precio guardado
   */
  async updateInvestmentPrices(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    try {
      const investments = await this.prisma.investment.findMany({
        include: {
          category: {
            include: {
              type: true,
            },
          },
        },
      });

      // Get GBP/USD rate once if needed (con caché mejorado)
      let gbpPrice: number | null = null;
      const needsGbpPrice = investments.some(inv => inv.gbp && inv.category?.type?.name?.toLowerCase() === 'equity');
      if (needsGbpPrice) {
        // Intentar con caché primero
        const gbpSymbols = ['GBPUSD=X', 'GBPUSD', 'GBP=X'];
        for (const symbol of gbpSymbols) {
          gbpPrice = await this.getPrice(symbol);
          if (gbpPrice && gbpPrice > 0) {
            break;
          }
        }
      }

      for (const inv of investments) {
        const concept = inv.concept?.toUpperCase().trim();
        if (!concept) {
          this.logger.warn(`Investment ${inv.id} has no concept, skipping`);
          continue;
        }

        const typeName = inv.category?.type?.name?.toLowerCase();
        if (typeName !== 'crypto' && typeName !== 'equity') {
          this.logger.debug(`Investment ${inv.id} (${concept}) is type ${typeName}, skipping`);
          continue;
        }

        try {
          let price = await this.getPrice(concept);
          this.logger.debug(`Looking for price of ${concept}: ${price}`);
          if (price && price > 0) {
            // Apply transformations before saving
            // The price from API is "raw", we need to transform it if x100 or gbp flags are set
            // If X100: divide price by 100
            // If GBP: multiply by GBP/USD rate
            if (typeName === 'equity') {
              // If x100 is enabled, divide price by 100 before saving
              if (inv.x100) {
                price = price / 100;
              }
              
              // If gbp is enabled, multiply by GBP/USD rate before saving
              if (inv.gbp && gbpPrice && gbpPrice > 0) {
                price = price * gbpPrice;
              }
            }

            await this.prisma.investment.update({
              where: { id: inv.id },
              data: { currentPrice: price },
            });
            this.logger.log(`Updated investment ${inv.id} (${concept}) with price ${price}`);
            updated++;
          } else {
            this.logger.warn(`No price found for ${concept} or price is 0`);
          }
        } catch (error) {
          this.logger.error(`Error updating price for investment ${inv.id}: ${error.message}`);
          errors++;
        }
      }
    } catch (error) {
      this.logger.error(`Error in updateInvestmentPrices: ${error.message}`);
      errors++;
    }

    return { updated, errors };
  }

  async updateHoldingPrices(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    try {
      const holdings = await this.prisma.holding.findMany({
        include: {
          category: {
            include: {
              type: true,
            },
          },
        },
      });

      // Get GBP/USD rate once if needed (con caché mejorado)
      let gbpPrice: number | null = null;
      const needsGbpPrice = holdings.some(holding => holding.gbp && holding.category?.type?.name?.toLowerCase() === 'equity');
      if (needsGbpPrice) {
        // Intentar con caché primero
        const gbpSymbols = ['GBPUSD=X', 'GBPUSD', 'GBP=X'];
        for (const symbol of gbpSymbols) {
          gbpPrice = await this.getPrice(symbol);
          if (gbpPrice && gbpPrice > 0) {
            break;
          }
        }
      }

      for (const holding of holdings) {
        const concept = holding.concept?.toUpperCase().trim();
        if (!concept) {
          this.logger.warn(`Holding ${holding.id} has no concept, skipping`);
          continue;
        }

        const typeName = holding.category?.type?.name?.toLowerCase();
        if (typeName !== 'crypto' && typeName !== 'equity') {
          this.logger.debug(`Holding ${holding.id} (${concept}) is type ${typeName}, skipping`);
          continue;
        }

        try {
          let price = await this.getPrice(concept);
          this.logger.debug(`Looking for price of ${concept}: ${price}`);
          if (price && price > 0) {
            // Apply transformations before saving
            // The price from API is "raw", we need to transform it if x100 or gbp flags are set
            // If X100: divide price by 100
            // If GBP: multiply by GBP/USD rate
            if (typeName === 'equity') {
              // If x100 is enabled, divide price by 100 before saving
              if (holding.x100) {
                price = price / 100;
              }
              
              // If gbp is enabled, multiply by GBP/USD rate before saving
              if (holding.gbp && gbpPrice && gbpPrice > 0) {
                price = price * gbpPrice;
              }
            }

            await this.prisma.holding.update({
              where: { id: holding.id },
              data: { currentPrice: price },
            });
            this.logger.log(`Updated holding ${holding.id} (${concept}) with price ${price}`);
            updated++;
          } else {
            this.logger.warn(`No price found for ${concept} or price is 0`);
          }
        } catch (error) {
          this.logger.error(`Error updating price for holding ${holding.id}: ${error.message}`);
          errors++;
        }
      }
    } catch (error) {
      this.logger.error(`Error in updateHoldingPrices: ${error.message}`);
      errors++;
    }

    return { updated, errors };
  }
}

