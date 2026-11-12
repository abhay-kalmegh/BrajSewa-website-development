export type BackendProbe = {
  ok: boolean
  status: number | null
  responseTimeMs: number
  detail: string
}

export type BackendDiagnostics = {
  ok: boolean
  checks: {
    liveness: BackendProbe
    readiness: BackendProbe
  }
}
