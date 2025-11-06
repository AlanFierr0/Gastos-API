import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FAConfigService } from './fa-config.service';
import { UpdateFAConfigDto } from './dto/update-fa-config.dto';

@ApiTags('fa-config')
@Controller('fa-config')
export class FAConfigController {
  constructor(private readonly faConfigService: FAConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get financial analysis configuration' })
  getConfig() {
    return this.faConfigService.getConfig();
  }

  @Put()
  @ApiOperation({ summary: 'Update financial analysis configuration' })
  updateConfig(@Body() dto: UpdateFAConfigDto) {
    return this.faConfigService.updateConfig(dto);
  }
}

