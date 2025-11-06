import { IsString, IsNumber, IsOptional, IsISO8601, Min, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInvestmentDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @Min(0)
  value?: number;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

