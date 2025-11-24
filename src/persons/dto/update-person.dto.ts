import { IsString, IsOptional } from 'class-validator';

export class UpdatePersonDto {
  @IsString()
  @IsOptional()
  name?: string;
}

