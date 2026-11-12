# BrajSewa.com Django backend

Owns catalog data, customer accounts, orders, and Razorpay payment verification.

## Run locally

1. Create a virtual environment and `pip install -r requirements.txt`.
2. Set the variables from the project `.env.example` (at minimum `DJANGO_SECRET_KEY` and the `POSTGRES_*` values).
   For plain-HTTP local work also set `DJANGO_DEBUG=true` or `DJANGO_HTTPS_ONLY=false`.
3. `python manage.py migrate`, `python manage.py createsuperuser`, `python manage.py runserver`.
4. Load the demo catalogue with `python manage.py seed_catalog` (safe to re-run), or add products at `/admin/`
   (path configurable with `DJANGO_ADMIN_PATH`). The seed data is placeholder content: replace names, prices,
   photos and stock with your real catalogue before launch.

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


## Transactional email (Resend)

For Render and other hosts that restrict outbound SMTP, use Resend's HTTPS API instead of Gmail SMTP.

1. Create an API key in Resend and add it to the backend host as `RESEND_API_KEY`. Never add the key to source control or a `NEXT_PUBLIC_*` frontend variable.
2. Set `EMAIL_BACKEND=shop.email_backend.ResendEmailBackend` (or leave it unset: production automatically selects Resend when `RESEND_API_KEY` is present).
3. For initial testing only, set `DEFAULT_FROM_EMAIL=BrajSewa <onboarding@resend.dev>`. Resend's testing sender can only deliver to the email address associated with your Resend account. Verify a domain in Resend before sending to arbitrary customer addresses.
4. Set `PUBLIC_SITE_URL` to the public frontend origin so verification and password-reset links point to the deployed app.
5. Redeploy the backend after changing environment variables.

The Resend backend uses HTTPS to `api.resend.com`, supports plain-text and HTML bodies, and raises delivery errors when Resend rejects or cannot accept a message. Email verification registration returns 503 when delivery fails. Verification resend remains non-enumerating and returns the same response for known and unknown addresses. Password-reset requests also remain non-enumerating.
