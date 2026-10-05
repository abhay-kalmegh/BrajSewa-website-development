# HomeShop2 Django backend

This service owns catalog data, customer accounts, orders, and Razorpay payment verification.

## Run locally

1. Create a Python virtual environment.
2. Install `requirements.txt`.
3. Set the variables from the project `.env.example` plus PostgreSQL variables.
4. Run `python manage.py migrate` and `python manage.py runserver` from this directory.

The Next.js frontend uses `NEXT_PUBLIC_API_BASE_URL` and calls `/api/v1/`. Razorpay secrets stay server-side in Django. Never expose `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` to the browser.
