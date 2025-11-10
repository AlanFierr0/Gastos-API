import { IsUUID, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInvestmentDto {
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

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  originalAmount: number;

  @IsOptional()
  @IsString()
  custodyEntity?: string;
}

