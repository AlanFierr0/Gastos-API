import { IsUUID, IsNumber, IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateHoldingDto {
  @IsUUID()
  personId: string;

  @IsUUID()
  categoryId: string;

  @IsString()
  concept: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  currentAmount: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  currentPrice?: number;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  originalAmount: number;

  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }
    return value;
  })
  date: string | Date;

  @IsOptional()
  @IsString()
  custodyEntity?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true' || value === '1';
    }
    return Boolean(value);
  })
  x100?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true' || value === '1';
    }
    return Boolean(value);
  })
  gbp?: boolean;
}

