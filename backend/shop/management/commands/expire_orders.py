from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from shop.models import Order
from shop.services import PENDING_ORDER_TTL_MINUTES, release_order


class Command(BaseCommand):
    help = 'Release reserved stock for orders that are still unpaid after N minutes. Run every ~5 minutes.'

    def add_arguments(self, parser):
        parser.add_argument('--minutes', type=int, default=PENDING_ORDER_TTL_MINUTES)

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(minutes=options['minutes'])
        ids = list(Order.objects.filter(status=Order.Status.PENDING, created_at__lt=cutoff)
                   .values_list('id', flat=True))
        released = sum(1 for order_id in ids if release_order(order_id, Order.Status.EXPIRED))
        self.stdout.write(f'Expired {released} unpaid order(s).')
