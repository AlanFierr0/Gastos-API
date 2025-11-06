import { IsISO8601, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : undefined))
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : undefined))
  maxAmount?: number;
}


