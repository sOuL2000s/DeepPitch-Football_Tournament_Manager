// backend/src/tournaments/dto/create-tournament.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TournamentFormat } from '@prisma/client';

export class CreateTournamentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiProperty({ enum: TournamentFormat, default: TournamentFormat.ROUND_ROBIN })
  @IsEnum(TournamentFormat)
  @IsOptional()
  formatType?: TournamentFormat;
}