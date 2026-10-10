import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RatingDirection, RatingReportStatus, RatingStatus, RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRatingInput, ReportRatingInput, ReviewReportInput } from './rating.schemas';

const rideForRating = {
  requestedByCustomer: { select: { userId: true } },
  driver: { select: { userId: true } },
  participants: { select: { customer: { select: { userId: true } } } },
} satisfies Prisma.RideInclude;

@Injectable()
export class RatingService {
  constructor(private readonly prisma: PrismaService) {}

  async createRating(rideId: string, raterUserId: string, input: CreateRatingInput) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Ride" WHERE "id" = ${rideId} FOR UPDATE`;
      const ride = await transaction.ride.findUnique({ where: { id: rideId }, include: rideForRating });
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== RideStatus.COMPLETED) throw new ConflictException('Only completed rides can be rated');
      const relationship = this.authorizeRelationship(ride, raterUserId, input.ratedUserId);
      const existing = await transaction.rating.findUnique({ where: { rideId_raterUserId_ratedUserId: { rideId, raterUserId, ratedUserId: input.ratedUserId } } });
      if (existing) throw new ConflictException('This ride relationship has already been rated');
      const rating = await transaction.rating.create({ data: { rideId, raterUserId, ratedUserId: input.ratedUserId, direction: relationship, score: input.score, reviewText: input.reviewText || null } });
      await transaction.auditLog.create({ data: { actorUserId: raterUserId, entityType: 'Rating', entityId: rating.id, action: 'RATING_CREATED', metadata: { rideId, ratedUserId: input.ratedUserId, score: input.score } } });
      return rating;
    });
  }

  getRideRatings(rideId: string, userId: string) {
    return this.prisma.rating.findMany({ where: { rideId, OR: [{ raterUserId: userId }, { ratedUserId: userId }] }, orderBy: { createdAt: 'asc' } });
  }

  async getSummary(userId: string) {
    const aggregate = await this.prisma.rating.aggregate({ where: { ratedUserId: userId, status: RatingStatus.PUBLISHED }, _avg: { score: true }, _count: { _all: true } });
    return { userId, averageScore: aggregate._avg.score ?? 0, totalRatings: aggregate._count._all };
  }

  getReviews(userId: string) {
    return this.prisma.rating.findMany({ where: { ratedUserId: userId, status: RatingStatus.PUBLISHED }, select: { id: true, rideId: true, score: true, reviewText: true, direction: true, createdAt: true, rater: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async reportRating(ratingId: string, reporterUserId: string, input: ReportRatingInput) {
    const rating = await this.prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw new NotFoundException('Rating not found');
    if (rating.raterUserId === reporterUserId) throw new ForbiddenException('Authors cannot report their own rating');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const report = await transaction.ratingReport.create({ data: { ratingId, reporterUserId, reason: input.reason } });
        await transaction.rating.update({ where: { id: ratingId }, data: { status: RatingStatus.REPORTED } });
        await transaction.auditLog.create({ data: { actorUserId: reporterUserId, entityType: 'RatingReport', entityId: report.id, action: 'RATING_REPORTED', metadata: { ratingId } } });
        return report;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This rating has already been reported by this user');
      throw error;
    }
  }

  async reviewReport(reportId: string, reviewerUserId: string, input: ReviewReportInput) {
    const report = await this.prisma.ratingReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Rating report not found');
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.ratingReport.update({ where: { id: reportId }, data: { status: input.status, reviewedAt: new Date() } });
      if (input.status === RatingReportStatus.DISMISSED) await transaction.rating.update({ where: { id: report.ratingId }, data: { status: RatingStatus.PUBLISHED } });
      if (input.status === RatingReportStatus.REVIEWED) await transaction.rating.update({ where: { id: report.ratingId }, data: { status: RatingStatus.HIDDEN } });
      await transaction.auditLog.create({ data: { actorUserId: reviewerUserId, entityType: 'RatingReport', entityId: reportId, action: `RATING_REPORT_${input.status}` } });
      return updated;
    });
  }

  private authorizeRelationship(ride: Prisma.RideGetPayload<{ include: typeof rideForRating }>, raterUserId: string, ratedUserId: string) {
    if (ride.driver?.userId === raterUserId) {
      const customerIds = new Set([ride.requestedByCustomer.userId, ...ride.participants.map(({ customer }) => customer.userId)]);
      if (!customerIds.has(ratedUserId)) throw new ForbiddenException('Driver may only rate a customer from this ride');
      return RatingDirection.DRIVER_TO_CUSTOMER;
    }
    const customerIds = new Set([ride.requestedByCustomer.userId, ...ride.participants.map(({ customer }) => customer.userId)]);
    if (!customerIds.has(raterUserId) || ride.driver?.userId !== ratedUserId) throw new ForbiddenException('Customer may only rate the assigned driver from this ride');
    return RatingDirection.CUSTOMER_TO_DRIVER;
  }
}
