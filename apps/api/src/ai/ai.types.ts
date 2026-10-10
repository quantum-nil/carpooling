import type { Recommendation, RideIntent } from './ai.schemas';

export interface AiProvider {
  extractRideIntent(message: string): Promise<unknown>;
  summarizeRideOptions(input: { intent: RideIntent; options: ReadonlyArray<AiRideOption> }): Promise<unknown>;
}

export interface AiRideOption {
  rideId: string;
  pickupAddress: string;
  destinationAddress: string;
  scheduledAt: string;
  seatsAvailable: number;
  estimatedFare: number | null;
  currency: string;
}

export interface AiRecommendationResult {
  intent: RideIntent;
  options: AiRideOption[];
  recommendation: Recommendation;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
