import { IsUUID, IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInvestmentDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  currentAmount?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  currentPrice?: number;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  originalAmount?: number;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (value && typeof value === 'string') {
      return new Date(value).toISOString();
    }
    return value;
  })
  date?: string | Date;

  @IsOptional()
  @IsString()
  custodyEntity?: string;
}

