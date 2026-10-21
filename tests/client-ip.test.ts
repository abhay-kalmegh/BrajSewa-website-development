/** Run with:  npx tsx tests/client-ip.test.ts */
import assert from 'node:assert/strict'
import { clientIp } from '../lib/api/client-ip'

let n = 0
const t = (name: string, got: string, want: string) => { assert.equal(got, want, name); n++; console.log('ok  ', name) }

const viewer = '49.36.10.20', cf = '130.176.1.5'
t('CloudFront + ALB, no forgery: viewer IP found', clientIp(`${viewer}, ${cf}`, 2), viewer)
t('attacker forges X-Forwarded-For: the forged entry is ignored', clientIp(`6.6.6.6, ${viewer}, ${cf}`, 2), viewer)
t('attacker forges several entries', clientIp(`1.1.1.1, 2.2.2.2, 3.3.3.3, ${viewer}, ${cf}`, 2), viewer)
t('ALB only (hops=1)', clientIp(`6.6.6.6, ${viewer}`, 1), viewer)
t('header shorter than trusted hops: refuse to guess', clientIp(viewer, 2), '')
t('missing header', clientIp(null, 2), '')
t('undefined header', clientIp(undefined, 2), '')
t('hops misconfigured as 0', clientIp(`${viewer}, ${cf}`, 0), '')
t('hops misconfigured as NaN', clientIp(`${viewer}, ${cf}`, Number('abc')), '')
t('hops misconfigured as a fraction', clientIp(`${viewer}, ${cf}`, 1.5), '')
t('IPv6 viewer', clientIp('2405:201:6004:a1::1, 2600:9000::1', 2), '2405:201:6004:a1::1')
t('non-IP text in a trusted slot is rejected', clientIp('x, <script>alert(1)</script>, 130.176.1.5', 2), '')
t('whitespace and empty entries tolerated', clientIp(` ${viewer} ,, ${cf} `, 2), viewer)
console.log(`\n${n} checks passed`)
