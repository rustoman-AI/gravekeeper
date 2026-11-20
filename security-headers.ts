// Requirement 21.6: the Content-Security-Policy of every response.
const DIRECTIVES = (isDev: boolean): readonly string[] => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

/** Builds the policy value; `'unsafe-eval'` is added to `script-src` in development only. */
export function contentSecurityPolicy(isDev: boolean): string {
  return DIRECTIVES(isDev).join('; ');
}
