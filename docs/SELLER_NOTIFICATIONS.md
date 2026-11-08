# Seller order notifications

Seller notifications are created only when Razorpay payment confirmation moves an order to `paid`. The order state and its `NotificationEvent` outbox record are written in the same database transaction. Provider outages therefore do not roll back a paid order.

## Delivery workflow

1. `mark_paid()` creates the unique `order-paid:<order-id>` event.
2. The scheduler runs `process_notification_outbox` once per minute.
3. The worker creates one delivery per seller and enabled channel (unique constraint: event + seller + channel).
4. Email is sent to the seller account email. WhatsApp/SMS are attempted only when the seller has opted in, the phone number is verified by staff, and the provider configuration is complete.
5. Failed deliveries are retried on later scheduler passes up to five attempts. The seller dashboard shows delivery status and the latest error.

The worker uses the existing database and scheduler container; no Celery broker or extra Redis queue is required. Redis remains used for API throttling.

## Email (SMTP)

Set these environment variables in the deployment environment:

- `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`
- `EMAIL_HOST`, `EMAIL_PORT` (usually 587), `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`
- `EMAIL_USE_TLS=true` (or `EMAIL_USE_SSL=true`, not both)
- `DEFAULT_FROM_EMAIL`

Local Django DEBUG mode defaults to the console email backend, so the message appears in the backend terminal.

## WhatsApp Business Cloud API

Configure:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_API_VERSION` (defaults to `v21.0`)
- `WHATSAPP_TEMPLATE_NAME`
- `WHATSAPP_TEMPLATE_LANGUAGE` (defaults to `en`)

Create and get approval for a WhatsApp template whose body has three text parameters in this order: order number, count of the seller's line items, and seller's item subtotal (INR). The seller must have opted in. Use the business-initiated template rules that apply to your WhatsApp Business account.

## SMS (MSG91)

Configure:

- `MSG91_AUTH_KEY`
- `MSG91_TEMPLATE_ID`
- `MSG91_SENDER_ID`

The MSG91 Flow template must have three variables in this order: order number, count of the seller's line items, and seller's item subtotal (INR). Register the sender/template under India's applicable DLT requirements. The seller must opt in.

## Phone verification

The seller can save an international-format phone number and opt in from the dashboard. The seller cannot set `phone_verified`; it remains false until an administrator verifies the number and marks it verified in Django Admin. This first implementation does not send OTPs or automatically verify phone ownership. Do not enable WhatsApp/SMS until that check is completed.

## API endpoints

- `GET/PATCH /api/v1/seller/notifications/preferences/`
- `GET /api/v1/seller/notifications/`

All endpoints require an authenticated, approved seller. The preferences API never accepts a client-supplied `phone_verified` value.

## Operational notes

- `sent` means the provider accepted the message; it does not guarantee the recipient's handset or inbox received it.
- The outbox and delivery rows are retained as an audit trail.
- The scheduler retries failures once per minute, with a maximum of five attempts per channel.
- Provider credentials belong in deployment secrets/environment variables, never in source control.
