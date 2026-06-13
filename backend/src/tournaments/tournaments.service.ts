// backend/src/tournaments/tournaments.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTournamentDto) {
    return this.prisma.tournament.create({
      data: {
        ...dto,
        organizerId: userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.tournament.findMany({
      where: { organizerId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id, organizerId: userId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  async update(id: string, userId: string, dto: UpdateTournamentDto) {
    await this.findOne(id, userId);
    return this.prisma.tournament.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.tournament.delete({
      where: { id },
    });
  }
}