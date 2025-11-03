import { IsNumber, IsISO8601, IsOptional, IsString, Min, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateIncomeDto {
  @IsString()
  source: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @Min(0.01)
  amount: number;

  @IsISO8601()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency?: string;
}


