CREATE INDEX "RideOffer_rideId_createdAt_idx" ON "RideOffer"("rideId", "createdAt");
CREATE INDEX "RideOffer_createdAt_idx" ON "RideOffer"("createdAt");
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");
CREATE INDEX "PaymentRefund_status_createdAt_idx" ON "PaymentRefund"("status", "createdAt");
CREATE INDEX "Rating_status_createdAt_idx" ON "Rating"("status", "createdAt");
CREATE INDEX "RecurringRideOccurrence_status_generatedAt_idx" ON "RecurringRideOccurrence"("status", "generatedAt");
