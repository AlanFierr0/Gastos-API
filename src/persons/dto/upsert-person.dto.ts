import { IsString, IsOptional } from 'class-validator';

export class UpsertPersonDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;
}



