import { IsEnum, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsEnum(['expense', 'income'])
  type: 'expense' | 'income';
}


