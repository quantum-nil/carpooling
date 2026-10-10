import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import type { CallingProvider, InitiateProviderCallInput, ProviderCall, ProviderCallStatus } from './calling.types';
import { CallStatus } from '@prisma/client';

@Injectable()
export class ExotelCallingProvider implements CallingProvider {
  constructor(private readonly config: ConfigService<AppEnv>) {}

  async initiateCall(input: InitiateProviderCallInput): Promise<ProviderCall> {
    const url = this.config.get('EXOTEL_CALL_URL');
    const apiKey = this.config.get('EXOTEL_API_KEY');
    const apiToken = this.config.get('EXOTEL_API_TOKEN');
    const virtualNumber = this.config.get('EXOTEL_VIRTUAL_NUMBER');
    if (!url || !apiKey || !apiToken || !virtualNumber) throw new ServiceUnavailableException('Calling provider is not configured');

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiToken}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: input.callId, from: input.fromPhoneNumber, to: input.toPhoneNumber, virtualNumber }),
    });
    if (!response.ok) throw new Error(`Exotel returned HTTP ${response.status}`);
    const payload = await response.json() as { id?: string; call_id?: string; status?: string };
    const providerReference = payload.id ?? payload.call_id;
    if (!providerReference) throw new Error('Exotel response did not contain a call reference');
    return { providerReference, status: this.mapStatus(payload.status) };
  }

  async getCallStatus(providerReference: string): Promise<ProviderCallStatus> {
    const url = this.config.get('EXOTEL_CALL_URL');
    const apiKey = this.config.get('EXOTEL_API_KEY');
    const apiToken = this.config.get('EXOTEL_API_TOKEN');
    if (!url || !apiKey || !apiToken) throw new ServiceUnavailableException('Calling provider is not configured');
    const response = await fetch(`${url}/${encodeURIComponent(providerReference)}`, { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiToken}`).toString('base64')}` } });
    if (!response.ok) throw new Error(`Exotel returned HTTP ${response.status}`);
    const payload = await response.json() as { status?: string; startedAt?: string; answeredAt?: string; endedAt?: string; failureReason?: string };
    return {
      status: this.mapStatus(payload.status),
      startedAt: payload.startedAt ? new Date(payload.startedAt) : undefined,
      answeredAt: payload.answeredAt ? new Date(payload.answeredAt) : undefined,
      endedAt: payload.endedAt ? new Date(payload.endedAt) : undefined,
      failureReason: payload.failureReason,
    };
  }

  private mapStatus(status?: string): CallStatus {
    switch (String(status ?? '').toUpperCase()) {
      case 'RINGING': return CallStatus.RINGING;
      case 'IN_PROGRESS': case 'INPROGRESS': case 'ANSWERED': return CallStatus.IN_PROGRESS;
      case 'COMPLETED': case 'HANGUP': return CallStatus.COMPLETED;
      case 'CANCELLED': case 'CANCELED': return CallStatus.CANCELLED;
      case 'FAILED': case 'BUSY': case 'NO_ANSWER': return CallStatus.FAILED;
      default: return CallStatus.INITIATING;
    }
  }
}
