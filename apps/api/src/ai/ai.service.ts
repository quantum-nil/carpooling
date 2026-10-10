import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { recommendationSchema, rideIntentSchema, type RideIntent } from './ai.schemas';
import { AI_PROVIDER, type AiProvider, type AiRecommendationResult, type AiRideOption } from './ai.types';

const discoverableStatuses = [RideStatus.OFFERED, RideStatus.ACCEPTED];

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService, @Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  async extractRideIntent(message: string): Promise<RideIntent> {
    const parsed = rideIntentSchema.safeParse(await this.provider.extractRideIntent(message));
    if (!parsed.success) throw new BadGatewayException('AI provider returned an invalid ride intent');
    this.validateIntent(parsed.data);
    return parsed.data;
  }

  async recommendRides(message: string): Promise<AiRecommendationResult> {
    const intent = await this.extractRideIntent(message);
    const rides = await this.prisma.ride.findMany({
      where: { status: { in: discoverableStatuses }, scheduledAt: { gt: new Date() } },
      select: { id: true, pickupAddress: true, destinationAddress: true, scheduledAt: true, seatCapacity: true, estimatedFare: true, currency: true, participants: { where: { status: 'CONFIRMED' }, select: { seats: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
    const options: AiRideOption[] = rides.map((ride) => ({
      rideId: ride.id,
      pickupAddress: ride.pickupAddress,
      destinationAddress: ride.destinationAddress,
      scheduledAt: ride.scheduledAt.toISOString(),
      seatsAvailable: Math.max(0, ride.seatCapacity - ride.participants.reduce((sum, participant) => sum + participant.seats, 0)),
      estimatedFare: ride.estimatedFare?.toNumber() ?? null,
      currency: ride.currency,
    })).filter((option) => option.seatsAvailable > 0);
    const parsed = recommendationSchema.safeParse(await this.provider.summarizeRideOptions({ intent, options }));
    if (!parsed.success) throw new BadGatewayException('AI provider returned an invalid recommendation');
    const optionIds = new Set(options.map((option) => option.rideId));
    return { intent, options, recommendation: { summary: parsed.data.summary, recommendations: parsed.data.recommendations.filter((recommendation) => optionIds.has(recommendation.rideId)) } };
  }

  private validateIntent(intent: RideIntent) {
    if (intent.scheduledAt && new Date(intent.scheduledAt).getTime() <= Date.now()) throw new BadRequestException('The requested ride time must be in the future');
    if (intent.pickup && intent.destination && intent.pickup.toLowerCase() === intent.destination.toLowerCase()) throw new BadRequestException('Pickup and destination must be different');
  }
}
