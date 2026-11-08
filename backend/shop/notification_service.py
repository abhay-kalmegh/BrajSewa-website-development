"""Seller order notification delivery.

The database outbox is the source of truth. Provider outages never roll back a paid order.
"""
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import NotificationDelivery, NotificationEvent, SellerNotificationPreference

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 5


def _enabled_channels():
    return {
        'email': bool(getattr(settings, 'DEFAULT_FROM_EMAIL', '') and getattr(settings, 'EMAIL_HOST', '')),
        'whatsapp': bool(os.getenv('WHATSAPP_ACCESS_TOKEN') and os.getenv('WHATSAPP_PHONE_NUMBER_ID')
                         and os.getenv('WHATSAPP_TEMPLATE_NAME')),
        'sms': bool(os.getenv('MSG91_AUTH_KEY') and os.getenv('MSG91_TEMPLATE_ID') and os.getenv('MSG91_SENDER_ID')),
    }


def _seller_amount(order, seller):
    return sum(line.unit_price_paise * line.quantity for line in order.lines.filter(product__seller=seller))


def _ensure_deliveries(event):
    order = event.order
    seller_ids = order.lines.exclude(product__seller__isnull=True).values_list('product__seller_id', flat=True).distinct()
    for seller_id in seller_ids:
        seller = event.order.lines.filter(product__seller_id=seller_id).first().product.seller
        prefs, _ = SellerNotificationPreference.objects.get_or_create(seller=seller)
        channels = _enabled_channels()
        if prefs.email_enabled and seller.user.email and channels['email']:
            NotificationDelivery.objects.get_or_create(
                event=event, seller=seller, channel=NotificationDelivery.Channel.EMAIL,
                defaults={'recipient': seller.user.email},
            )
        if prefs.phone_verified and prefs.phone and prefs.whatsapp_opt_in and channels['whatsapp']:
            NotificationDelivery.objects.get_or_create(
                event=event, seller=seller, channel=NotificationDelivery.Channel.WHATSAPP,
                defaults={'recipient': prefs.phone},
            )
        if prefs.phone_verified and prefs.phone and prefs.sms_opt_in and channels['sms']:
            NotificationDelivery.objects.get_or_create(
                event=event, seller=seller, channel=NotificationDelivery.Channel.SMS,
                defaults={'recipient': prefs.phone},
            )


def _order_message(delivery):
    order = delivery.event.order
    seller = delivery.seller
    lines = order.lines.filter(product__seller=seller).select_related('product')
    items = list(lines)
    item_text = '\\n'.join(
        f'- {line.product_name or line.product.name} × {line.quantity} (₹{line.unit_price_paise * line.quantity / 100:,.2f})'
        for line in items
    )
    amount = _seller_amount(order, seller) / 100
    subject = f'New BrajSewa order #{order.pk}'
    body = (
        f'Namaste {seller.display_name},\\n\\n'
        f'You have received a paid order on BrajSewa.\\n'
        f'Order: #{order.pk}\\n{item_text}\\n'
        f'Your items total: ₹{amount:,.2f}\\n\\n'
        f'Delivery details:\\n{order.first_name} {order.last_name}\\n{order.phone}\\n'
        f'{order.address}, {order.city}, {order.state} - {order.postal_code}\\n\\n'
        'Please sign in to your seller dashboard to process this order.\\nBrajSewa Team'
    )
    return subject, body, amount, len(items)


def _http_post(url, payload, headers):
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', **headers}, method='POST',
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        data = response.read(8192).decode('utf-8', errors='replace')
        return json.loads(data) if data else {}


def _send_delivery(delivery):
    subject, body, amount, item_count = _order_message(delivery)
    if delivery.channel == NotificationDelivery.Channel.EMAIL:
        sent = send_mail(
            subject, body, settings.DEFAULT_FROM_EMAIL, [delivery.recipient],
            fail_silently=False,
        )
        if sent != 1:
            raise RuntimeError('Email backend did not accept the message.')
        return ''

    if delivery.channel == NotificationDelivery.Channel.WHATSAPP:
        token = os.environ['WHATSAPP_ACCESS_TOKEN']
        phone_id = os.environ['WHATSAPP_PHONE_NUMBER_ID']
        version = os.getenv('WHATSAPP_GRAPH_API_VERSION', 'v21.0')
        template = os.environ['WHATSAPP_TEMPLATE_NAME']
        order = delivery.event.order
        payload = {
            'messaging_product': 'whatsapp', 'to': delivery.recipient,
            'type': 'template',
            'template': {
                'name': template, 'language': {'code': os.getenv('WHATSAPP_TEMPLATE_LANGUAGE', 'en')},
                'components': [{
                    'type': 'body', 'parameters': [
                        {'type': 'text', 'text': str(order.pk)},
                        {'type': 'text', 'text': str(item_count)},
                        {'type': 'text', 'text': f'{amount:,.2f}'},
                    ],
                }],
            },
        }
        data = _http_post(
            f'https://graph.facebook.com/{version}/{phone_id}/messages',
            payload, {'Authorization': f'Bearer {token}'},
        )
        messages = data.get('messages') or []
        return str(messages[0].get('id', '')) if messages else ''

    if delivery.channel == NotificationDelivery.Channel.SMS:
        auth_key = os.environ['MSG91_AUTH_KEY']
        payload = {
            'template_id': os.environ['MSG91_TEMPLATE_ID'],
            'sender': os.environ['MSG91_SENDER_ID'],
            'short_url': '0',
            'recipients': [{
                'mobiles': delivery.recipient.lstrip('+'),
                'var1': str(delivery.event.order_id),
                'var2': str(item_count),
                'var3': f'{amount:,.2f}',
            }],
        }
        data = _http_post(
            'https://control.msg91.com/api/v5/flow/',
            payload, {'authkey': auth_key},
        )
        return str(data.get('request_id') or data.get('message') or '')
    raise ValueError(f'Unsupported notification channel: {delivery.channel}')


def process_notification_outbox(limit=100):
    """Create channel deliveries and send due notifications. Safe to run repeatedly."""
    now = timezone.now()
    # Recover claims abandoned by a worker/container restart.
    NotificationDelivery.objects.filter(
        status=NotificationDelivery.Status.SENDING,
        updated_at__lt=now - timedelta(minutes=10),
        attempt_count__lt=MAX_ATTEMPTS,
    ).update(status=NotificationDelivery.Status.FAILED, error_message='Recovered after interrupted delivery.')

    processed = 0
    events = NotificationEvent.objects.filter(
        status=NotificationEvent.Status.PENDING,
    ).select_related('order').order_by('created_at')[:limit]
    for event in events:
        _ensure_deliveries(event)
        deliveries = NotificationDelivery.objects.filter(event=event).order_by('created_at')
        for delivery in deliveries:
            if delivery.status in (NotificationDelivery.Status.SENT, NotificationDelivery.Status.SKIPPED):
                continue
            if delivery.attempt_count >= MAX_ATTEMPTS:
                continue
            # Conditional update is the claim: two overlapping scheduler passes cannot send the same row.
            claimed = NotificationDelivery.objects.filter(
                pk=delivery.pk,
                status__in=[NotificationDelivery.Status.QUEUED, NotificationDelivery.Status.FAILED],
                attempt_count__lt=MAX_ATTEMPTS,
            ).update(status=NotificationDelivery.Status.SENDING, attempt_count=F('attempt_count') + 1, error_message='')
            if not claimed:
                continue
            delivery.refresh_from_db()
            try:
                provider_id = _send_delivery(delivery)
                delivery.status = NotificationDelivery.Status.SENT
                delivery.provider_message_id = provider_id[:160]
                delivery.sent_at = timezone.now()
                delivery.error_message = ''
                logger.info('Seller notification sent: event=%s delivery=%s channel=%s',
                            event.pk, delivery.pk, delivery.channel)
            except (Exception,):
                delivery.status = NotificationDelivery.Status.FAILED
                delivery.error_message = ' '.join(str(__import__('sys').exc_info()[1]).split())[:500]
                logger.exception('Seller notification failed: event=%s delivery=%s channel=%s',
                                 event.pk, delivery.pk, delivery.channel)
            delivery.save(update_fields=[
                'status', 'provider_message_id', 'sent_at', 'error_message', 'updated_at',
            ])
            processed += 1

        remaining = NotificationDelivery.objects.filter(event=event).exclude(
            status__in=[NotificationDelivery.Status.SENT, NotificationDelivery.Status.SKIPPED],
        ).filter(attempt_count__lt=MAX_ATTEMPTS).exists()
        if not remaining:
            NotificationEvent.objects.filter(pk=event.pk).update(
                status=NotificationEvent.Status.PROCESSED, attempts=F('attempts') + 1, last_error='',
            )
    return processed
