import { IsUUID, IsNumber, IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateHoldingDto {
  @IsOptional()
  @IsUUID()
  personId?: string;

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
  @IsString()
  sector?: string;

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

