// Target for load-balancer, container and Kubernetes health checks.
//
// Deliberately does NOT call Django. If the API is briefly down the web tier should still count as alive (pages show
// an error boundary and recover on their own) instead of being killed and restarted in a loop, which would turn a
// short API problem into a full outage. Django reports its own readiness at /readyz/.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
