import logging
import time

import razorpay
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from shop.models import Order
from shop.reconcile import TooManyPayments, fetch_payments, find_discrepancies

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = ('Report Razorpay payments that were captured but have no paid order (customer charged, order never confirmed). '
            'Exits non-zero when it finds any, so a scheduler or alert notices. Run hourly.')

    def add_arguments(self, parser):
        parser.add_argument('--hours', type=int, default=3, help='how far back to look (default 3)')
        parser.add_argument('--grace-minutes', type=int, default=10, help='ignore very recent payments the webhook may not have processed yet')

    def handle(self, *args, **options):
        if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
            raise CommandError('Razorpay keys are not configured.')
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        now = int(time.time())
        try:
            payments = list(fetch_payments(client.payment.all, now - options['hours'] * 3600, now))
        except TooManyPayments as exc:
            raise CommandError(str(exc))
        ids = {p.get('order_id') for p in payments if p.get('order_id')}
        orders = {o['razorpay_order_id']: o for o in Order.objects.filter(razorpay_order_id__in=ids).values('razorpay_order_id', 'status', 'total_paise')}
        problems = find_discrepancies(payments, orders, now, grace_seconds=options['grace_minutes'] * 60)
        for p in problems:
            logger.error('MANUAL REVIEW: reconcile %s payment=%s razorpay_order=%s amount=%s: %s',
                         p['kind'], p['payment_id'], p['razorpay_order_id'], p['amount'], p['detail'])
            self.stdout.write(f"{p['kind']}: payment {p['payment_id']} (order {p['razorpay_order_id']}, amount {p['amount']}): {p['detail']}")
        captured = sum(1 for p in payments if p.get('status') == 'captured')
        if problems:
            raise CommandError(f'{len(problems)} discrepancy(ies) among {captured} captured payment(s).')
        self.stdout.write(self.style.SUCCESS(f'Reconciled {captured} captured payment(s): no discrepancies.'))
