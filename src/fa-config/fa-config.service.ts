import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateFAConfigDto } from './dto/update-fa-config.dto';

const DEFAULT_CONFIG_ID = 'default';

@Injectable()
export class FAConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    let config = await this.prisma.financialAnalysisConfig.findUnique({
      where: { id: DEFAULT_CONFIG_ID },
    });

    if (!config) {
      // Create default config if it doesn't exist
      config = await this.prisma.financialAnalysisConfig.create({
        data: {
          id: DEFAULT_CONFIG_ID,
          fixed: [],
          wellbeing: [],
          saving: [],
          targetFixed: 50,
          targetWellbeing: 30,
          targetSaving: 20,
        },
      });
    }

    // Transform to match frontend format (Json fields are already arrays)
    return {
      fixed: Array.isArray(config.fixed) ? config.fixed : [],
      wellbeing: Array.isArray(config.wellbeing) ? config.wellbeing : [],
      saving: Array.isArray(config.saving) ? config.saving : [],
      targets: {
        fixed: config.targetFixed || 50,
        wellbeing: config.targetWellbeing || 30,
        saving: config.targetSaving || 20,
      },
    };
  }

  async updateConfig(dto: UpdateFAConfigDto) {
    const existing = await this.prisma.financialAnalysisConfig.findUnique({
      where: { id: DEFAULT_CONFIG_ID },
    });

    const data: any = {};
    if (dto.fixed !== undefined) data.fixed = dto.fixed;
    if (dto.wellbeing !== undefined) data.wellbeing = dto.wellbeing;
    if (dto.saving !== undefined) data.saving = dto.saving;
    if (dto.targetFixed !== undefined) data.targetFixed = dto.targetFixed;
    if (dto.targetWellbeing !== undefined) data.targetWellbeing = dto.targetWellbeing;
    if (dto.targetSaving !== undefined) data.targetSaving = dto.targetSaving;

    let config;
    if (existing) {
      config = await this.prisma.financialAnalysisConfig.update({
        where: { id: DEFAULT_CONFIG_ID },
        data,
      });
    } else {
      config = await this.prisma.financialAnalysisConfig.create({
        data: {
          id: DEFAULT_CONFIG_ID,
          fixed: dto.fixed || [],
          wellbeing: dto.wellbeing || [],
          saving: dto.saving || [],
          targetFixed: dto.targetFixed ?? 50,
          targetWellbeing: dto.targetWellbeing ?? 30,
          targetSaving: dto.targetSaving ?? 20,
        },
      });
    }

    // Transform to match frontend format (Json fields are already arrays)
    return {
      fixed: Array.isArray(config.fixed) ? config.fixed : [],
      wellbeing: Array.isArray(config.wellbeing) ? config.wellbeing : [],
      saving: Array.isArray(config.saving) ? config.saving : [],
      targets: {
        fixed: config.targetFixed || 50,
        wellbeing: config.targetWellbeing || 30,
        saving: config.targetSaving || 20,
      },
    };
  }
}

