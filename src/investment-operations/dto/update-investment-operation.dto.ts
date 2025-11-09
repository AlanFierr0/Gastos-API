import { PartialType } from '@nestjs/mapped-types';
import { CreateInvestmentOperationDto } from './create-investment-operation.dto';

export class UpdateInvestmentOperationDto extends PartialType(CreateInvestmentOperationDto) {}

