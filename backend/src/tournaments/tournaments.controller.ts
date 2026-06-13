// backend/src/tournaments/tournaments.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('tournaments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tournament' })
  create(@Request() req, @Body() createTournamentDto: CreateTournamentDto) {
    return this.tournamentsService.create(req.user.userId, createTournamentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tournaments for current user' })
  findAll(@Request() req) {
    return this.tournamentsService.findAll(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tournament by ID' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.tournamentsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tournament' })
  update(@Request() req, @Param('id') id: string, @Body() updateTournamentDto: UpdateTournamentDto) {
    return this.tournamentsService.update(id, req.user.userId, updateTournamentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tournament' })
  remove(@Request() req, @Param('id') id: string) {
    return this.tournamentsService.remove(id, req.user.userId);
  }
}