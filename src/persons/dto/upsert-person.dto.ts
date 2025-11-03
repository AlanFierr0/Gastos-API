import { IsString } from 'class-validator';

export class UpsertPersonDto {
  @IsString()
  name: string;
}



