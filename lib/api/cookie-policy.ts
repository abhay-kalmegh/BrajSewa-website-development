/**
 * Decide whether auth cookies carry the Secure flag, and refuse an insecure production configuration.
 *
 * A cookie without `Secure` is sent over plain HTTP, where anyone on the network can read and replay it. That is
 * acceptable only for local development, so in production it must be an explicit, deliberate opt-out
 * (ALLOW_INSECURE_COOKIES=true) rather than something a missing variable can cause.
 */
export type CookieEnv = {
  NODE_ENV?: string
  AUTH_COOKIE_SECURE?: string
  ALLOW_INSECURE_COOKIES?: string
}

export function resolveSecureCookies(env: CookieEnv): boolean {
  const production = env.NODE_ENV === 'production'
  const secure = (env.AUTH_COOKIE_SECURE ?? String(production)) === 'true'
  if (production && !secure && env.ALLOW_INSECURE_COOKIES !== 'true') {
    throw new Error(
      'Refusing to set auth cookies without the Secure flag in production. Serve the site over HTTPS and set ' +
        'AUTH_COOKIE_SECURE=true (or, for a local plain-HTTP run only, ALLOW_INSECURE_COOKIES=true).',
    )
  }
  return secure
}
