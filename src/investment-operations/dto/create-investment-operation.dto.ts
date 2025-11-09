import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export enum OperationType {
  COMPRA = 'COMPRA',
  VENTA = 'VENTA',
  AJUSTE = 'AJUSTE',
}

export class CreateInvestmentOperationDto {
  @IsUUID()
  @IsNotEmpty()
  investmentId: string;

  @IsEnum(OperationType)
  @IsNotEmpty()
  type: OperationType;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  note?: string;
}

