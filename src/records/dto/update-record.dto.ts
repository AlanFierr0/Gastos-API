import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class UpdateRecordDto {
  @IsString()
  @IsOptional()
  concepto?: string;

  @IsNumber()
  @IsOptional()
  monto?: number;

  @IsDateString()
  @IsOptional()
  fecha?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;
}
