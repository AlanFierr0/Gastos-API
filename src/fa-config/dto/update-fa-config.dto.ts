import { IsArray, IsNumber, IsOptional, Min, Max, IsString } from 'class-validator';

export class UpdateFAConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fixed?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wellbeing?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  saving?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  targetFixed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  targetWellbeing?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  targetSaving?: number;
}

