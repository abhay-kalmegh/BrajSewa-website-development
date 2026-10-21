FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Build-time only secret: collectstatic needs settings to import, not a real key.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput
RUN useradd --system --uid 1001 app && chown -R app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/healthz/', timeout=3)"
# The web process only serves traffic. Schema migrations are a separate release step (a one-shot `migrate` service in
# docker-compose, a pre-deploy task in ECS, a PreSync Job in Kubernetes) so several replicas never race each other.
# `exec` makes gunicorn PID 1 so it receives SIGTERM and drains in-flight requests (--graceful-timeout) on deploy.
# --keep-alive must exceed the load balancer's idle timeout (ALB default 60 s) or the balancer reuses a connection
# the app already closed and users see sporadic 502s.
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --worker-class gthread --workers ${GUNICORN_WORKERS:-2} --threads ${GUNICORN_THREADS:-4} --timeout ${GUNICORN_TIMEOUT:-60} --graceful-timeout 30 --keep-alive 75 --access-logfile -"]
