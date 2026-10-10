import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import type { EmailNotificationInput, EmailNotificationProvider, ProviderDeliveryResult } from './notification.types';

@Injectable()
export class ResendEmailProvider implements EmailNotificationProvider {
  constructor(private readonly config: ConfigService<AppEnv>) {}

  async send(input: EmailNotificationInput): Promise<ProviderDeliveryResult> {
    const apiKey = this.config.get('RESEND_API_KEY');
    const from = this.config.get('RESEND_FROM_EMAIL');
    if (!apiKey || !from) throw new Error('Email provider is not configured');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    });
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
    const result = await response.json() as { id?: string };
    return { providerMessageId: result.id };
  }
}
