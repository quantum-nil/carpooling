export const REFRESH_COOKIE_NAME = 'refresh_token';

export const refreshCookieOptions = (isProduction: boolean, maxAge: number) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict' as const,
  path: '/auth',
  maxAge,
});
