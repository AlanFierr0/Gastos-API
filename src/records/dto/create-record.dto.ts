import { IsString, IsNumber, IsDateString } from 'class-validator';

export class CreateRecordDto {
  @IsString()
  categoria: string;

  @IsString()
  nombre: string;

  @IsNumber()
  monto: number;

  @IsDateString()
  fecha: string;

  @IsString()
  nota: string;
}
