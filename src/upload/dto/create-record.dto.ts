import { IsString, IsNumber, IsDateString } from 'class-validator';

export class CreateRecordDto {
  @IsString()
  categoria: string; // agrupable

  @IsString()
  nombre: string; // agrupable

  @IsNumber()
  monto: number;

  @IsDateString()
  fecha: string;

  @IsString()
  nota: string; // string libre
}
