/** Run with:  npx tsx tests/session-lifetime.test.ts */
import assert from 'node:assert/strict'
import { refreshMaxAgeSeconds } from '../lib/api/session-lifetime'

let n = 0
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }
const DAY = 86400

t('default is three days (it was seven)', () => assert.equal(refreshMaxAgeSeconds({}), 3 * DAY))
t('configurable within 1 to 30 days', () => { assert.equal(refreshMaxAgeSeconds({ AUTH_REFRESH_DAYS: '1' }), DAY); assert.equal(refreshMaxAgeSeconds({ AUTH_REFRESH_DAYS: '30' }), 30 * DAY) })
t('out-of-range values are refused', () => { for (const bad of ['0', '31', '365', '-1']) assert.throws(() => refreshMaxAgeSeconds({ AUTH_REFRESH_DAYS: bad }), /AUTH_REFRESH_DAYS/, bad) })
t('non-integer values are refused, never silently truncated', () => { for (const bad of ['', 'abc', '1.5', '3d', ' 3', '1e1']) assert.throws(() => refreshMaxAgeSeconds({ AUTH_REFRESH_DAYS: bad }), /AUTH_REFRESH_DAYS/, JSON.stringify(bad)) })
console.log(`\n${n} checks passed`)
