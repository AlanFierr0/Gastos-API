import { IsUUID, IsNumber, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateExpenseDto {
  @IsUUID()
  categoryId: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  amount: number;

  @IsISO8601()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency?: string; // ISO 4217, default ARS
}


