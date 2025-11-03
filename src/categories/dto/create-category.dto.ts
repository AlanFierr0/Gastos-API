import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  // Either provide existing typeId or a typeName to create/find
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  typeName?: string;
}


