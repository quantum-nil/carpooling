import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    return result.data;
  }
}

export const nonEmptyToken = z.string().min(32).max(256);
