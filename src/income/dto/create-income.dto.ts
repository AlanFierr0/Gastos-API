import { IsNumber, IsISO8601, IsOptional, IsString, Min, Matches, IsUUID, IsBoolean } from 'class-validator';
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

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isRecurring?: boolean;
}


