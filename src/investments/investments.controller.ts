import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InvestmentsService } from './investments.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentDto } from './dto/update-investment.dto';

@ApiTags('investments')
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new investment' })
  create(@Body() createInvestmentDto: CreateInvestmentDto) {
    return this.investmentsService.create(createInvestmentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all investments' })
  findAll() {
    return this.investmentsService.findAll();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get investment summary (total value, invested, profit)' })
  async getSummary() {
    const [totalValue, totalInvested, profit] = await Promise.all([
      this.investmentsService.getTotalValue(),
      this.investmentsService.getTotalInvested(),
      this.investmentsService.getProfit(),
    ]);
    return { totalValue, totalInvested, profit };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get investment by ID' })
  findOne(@Param('id') id: string) {
    return this.investmentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update investment' })
  update(@Param('id') id: string, @Body() updateInvestmentDto: UpdateInvestmentDto) {
    return this.investmentsService.update(id, updateInvestmentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete investment' })
  remove(@Param('id') id: string) {
    return this.investmentsService.remove(id);
  }
}

