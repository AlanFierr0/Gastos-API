import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class CreateRecordDto {
  @IsString()
  concepto: string;

  @IsNumber()
  monto: number;

  @IsDateString()
  fecha: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;
}
