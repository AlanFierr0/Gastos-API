import { IsUUID, IsNumber, IsISO8601, IsOptional, IsString, Matches, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ExpenseType } from '@prisma/client';

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  amount?: number;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency?: string;

  @IsOptional()
  @IsEnum(ExpenseType)
  expenseType?: ExpenseType;
}


