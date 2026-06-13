// backend/src/tournaments/dto/update-tournament.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateTournamentDto } from './create-tournament.dto';

export class UpdateTournamentDto extends PartialType(CreateTournamentDto) {}