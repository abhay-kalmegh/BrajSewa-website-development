"""Liveness and readiness probes that work behind a load balancer or Kubernetes.

Why this is a middleware and not a normal view
  ALB target-group health checks and kubelet probes send the TARGET'S IP address as the Host header. Django
  validates Host (ALLOWED_HOSTS) early, in CommonMiddleware, and answers 400 before URL routing, so a view-based
  /healthz/ is "unhealthy" on every target and the orchestrator kills perfectly good containers. `request.path`
  does not trigger host validation, so this middleware must be FIRST in MIDDLEWARE.

  /healthz/  liveness  : the process is up and answering. Never touches the database, so a database blip does not
                         make the orchestrator restart healthy containers.
  /readyz/   readiness : PostgreSQL answers. The cache is deliberately NOT checked: it only backs rate limiting,
                         which must not be able to take the whole site out of rotation.
"""
from django.db import connection
from django.http import HttpResponse


class HealthCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == '/healthz/':
            return HttpResponse('ok', content_type='text/plain')
        if request.path == '/readyz/':
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT 1')
            except Exception:
                return HttpResponse('database unavailable', status=503, content_type='text/plain')
            return HttpResponse('ok', content_type='text/plain')
        return self.get_response(request)
