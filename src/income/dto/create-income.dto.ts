import { IsNumber, IsISO8601, IsOptional, IsString, Matches, IsUUID, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateIncomeDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  concept: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  amount: number;

  @IsISO8601()
  date: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isRecurring?: boolean;
}


