from django.core.management.base import BaseCommand

from shop.notification_service import process_notification_outbox


class Command(BaseCommand):
    help = 'Process pending seller order notification events and retry failed deliveries.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=100)

    def handle(self, *args, **options):
        limit = options['limit']
        if limit < 1 or limit > 1000:
            self.stderr.write(self.style.ERROR('--limit must be between 1 and 1000.'))
            return
        processed = process_notification_outbox(limit=limit)
        self.stdout.write(self.style.SUCCESS(f'Processed {processed} seller notification delivery attempt(s).'))
