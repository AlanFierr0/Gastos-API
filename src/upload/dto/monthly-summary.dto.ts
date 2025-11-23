import { IsString, IsNotEmpty } from 'class-validator';

export class MonthlySummaryDto {
  @IsString()
  @IsNotEmpty()
  summary: string;
}

