/**
 * Decide whether auth cookies carry the Secure flag, and refuse an insecure production configuration.
 *
 * A cookie without `Secure` is sent over plain HTTP, where anyone on the network can read and replay it. That is
 * acceptable only for local development, so in production it must be an explicit, deliberate opt-out
 * (ALLOW_INSECURE_COOKIES=true) rather than something a missing variable can cause.
 */
// Any environment object. (A type listing only optional keys would reject `process.env`: TypeScript's weak-type
// check refuses an object that shares no declared property with it.)
export type CookieEnv = Readonly<Record<string, string | undefined>>

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
