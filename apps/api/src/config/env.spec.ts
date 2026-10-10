import { envSchema } from './env';

describe('environment validation', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['TRUE', true],
    ['FALSE', false],
  ])('parses S3_FORCE_PATH_STYLE=%s as %s', (input, expected) => {
    expect(envSchema.shape.S3_FORCE_PATH_STYLE.parse(input)).toBe(expected);
  });

  it('rejects invalid S3_FORCE_PATH_STYLE values', () => {
    expect(envSchema.shape.S3_FORCE_PATH_STYLE.safeParse('no').success).toBe(false);
  });
});
