# BrajSewa.com Django backend

Owns catalog data, customer accounts, orders, and Razorpay payment verification.

## Run locally

1. Create a virtual environment and `pip install -r requirements.txt`.
2. Set the variables from the project `.env.example` (at minimum `DJANGO_SECRET_KEY` and the `POSTGRES_*` values).
   For plain-HTTP local work also set `DJANGO_DEBUG=true` or `DJANGO_HTTPS_ONLY=false`.
3. `python manage.py migrate`, `python manage.py createsuperuser`, `python manage.py runserver`.
4. Add products at `/admin/` (path configurable with `DJANGO_ADMIN_PATH`).

Tests: `DJANGO_HTTPS_ONLY=false python manage.py test` (needs Postgres, same env vars as above).

## Operations

* **Unpaid orders reserve stock.** Run `python manage.py expire_orders` every ~5 minutes (the compose file
  includes a `scheduler` service). It returns stock for orders still unpaid after 30 minutes.
  Watch the logs for `MANUAL REVIEW`: that is a customer who paid for an order that had already expired
  and needs a refund or manual fulfilment.
* **Rate limiting** uses the Django cache. Set `REDIS_URL` in production: the in-memory fallback is
  per-process, so with N gunicorn workers the limits are effectively N times higher and reset on restart.
* **`API_NUM_PROXIES`** must equal the number of reverse proxies between the internet and Django
  (for example 1 behind a single load balancer). If it is wrong, per-IP limits can be bypassed by spoofing
  `X-Forwarded-For`. Per-account login limits and per-user order/payment limits do not depend on it.
* **Auth tokens.** Access tokens last 15 minutes, refresh tokens 7 days. The Next.js app keeps them in
  httpOnly cookies and never exposes them to browser JavaScript. Logout blacklists the refresh token.
* Secrets (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `DJANGO_SECRET_KEY`) stay on the server.
