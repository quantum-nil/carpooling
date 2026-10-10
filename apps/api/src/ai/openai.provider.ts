import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import { recommendationSystemPrompt, rideIntentSystemPrompt } from './ai.prompts';
import type { AiProvider, AiRideOption } from './ai.types';
import type { RideIntent } from './ai.schemas';

@Injectable()
export class OpenAiProvider implements AiProvider {
  constructor(private readonly config: ConfigService<AppEnv>) {}

  extractRideIntent(message: string): Promise<unknown> {
    return this.complete(rideIntentSystemPrompt, message);
  }

  summarizeRideOptions(input: { intent: RideIntent; options: ReadonlyArray<AiRideOption> }): Promise<unknown> {
    return this.complete(recommendationSystemPrompt, JSON.stringify({ intent: input.intent, options: input.options }));
  }

  private async complete(systemPrompt: string, userContent: string): Promise<unknown> {
    const apiKey = this.config.get('OPENAI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('AI provider is not configured');
    const baseUrl = this.config.getOrThrow('OPENAI_BASE_URL');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.getOrThrow('OPENAI_MODEL'), temperature: 0, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }], response_format: { type: 'json_object' } }),
    });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI provider returned an empty response');
    try { return JSON.parse(content); } catch { throw new Error('AI provider returned invalid JSON'); }
  }
}
