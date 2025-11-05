import { IsString, IsNumber, IsOptional, IsISO8601, IsUUID, Min, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInvestmentDto {
  @IsString()
  type: string; // bitcoin, fci, acciones, etc.

  @IsString()
  name: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @Min(0.01)
  amount: number; // Monto invertido

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @Min(0)
  value: number; // Valor actual

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency?: string; // ISO 4217, default ARS

  @IsISO8601()
  date: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

