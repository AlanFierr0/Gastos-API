import { IsISO8601, IsOptional, IsString, IsNumber, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryIncomeDto {
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  source?: string; // filter by source contains

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : undefined))
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : undefined))
  maxAmount?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}


