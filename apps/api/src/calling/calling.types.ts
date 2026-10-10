import type { CallStatus } from '@prisma/client';

export interface InitiateProviderCallInput {
  callId: string;
  fromPhoneNumber: string;
  toPhoneNumber: string;
}

export interface ProviderCall {
  providerReference: string;
  status: CallStatus;
}

export interface ProviderCallStatus {
  status: CallStatus;
  startedAt?: Date;
  answeredAt?: Date;
  endedAt?: Date;
  failureReason?: string;
}

export interface CallingProvider {
  initiateCall(input: InitiateProviderCallInput): Promise<ProviderCall>;
  getCallStatus(providerReference: string): Promise<ProviderCallStatus>;
}

export const CALLING_PROVIDER = Symbol('CALLING_PROVIDER');
