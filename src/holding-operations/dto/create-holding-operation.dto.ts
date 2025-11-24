import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export enum OperationType {
  COMPRA = 'COMPRA',
  VENTA = 'VENTA',
  AJUSTE = 'AJUSTE',
}

export class CreateHoldingOperationDto {
  @IsUUID()
  @IsNotEmpty()
  holdingId: string;

  @IsEnum(OperationType)
  @IsNotEmpty()
  type: OperationType;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }
    return value;
  })
  date: string | Date;

  @IsString()
  @IsOptional()
  note?: string;
}

