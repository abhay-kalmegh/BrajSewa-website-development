import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('shop', '0005_alter_product_image_url'),
    ]

    operations = [
        migrations.CreateModel(
            name='SellerNotificationPreference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone', models.CharField(blank=True, max_length=24)),
                ('phone_verified', models.BooleanField(default=False)),
                ('email_enabled', models.BooleanField(default=True)),
                ('whatsapp_opt_in', models.BooleanField(default=False)),
                ('sms_opt_in', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('seller', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='notification_preferences', to='shop.sellerprofile')),
            ],
        ),
        migrations.CreateModel(
            name='NotificationEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(default='order_paid', max_length=40)),
                ('idempotency_key', models.CharField(max_length=100, unique=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('processed', 'Processed')], default='pending', max_length=20)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('last_error', models.CharField(blank=True, max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='notification_events', to='shop.order')),
            ],
        ),
        migrations.CreateModel(
            name='NotificationDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('channel', models.CharField(choices=[('email', 'Email'), ('whatsapp', 'WhatsApp'), ('sms', 'SMS')], max_length=12)),
                ('recipient', models.CharField(max_length=254)),
                ('status', models.CharField(choices=[('queued', 'Queued'), ('sending', 'Sending'), ('sent', 'Sent'), ('failed', 'Failed'), ('skipped', 'Skipped')], default='queued', max_length=12)),
                ('attempt_count', models.PositiveSmallIntegerField(default=0)),
                ('provider_message_id', models.CharField(blank=True, max_length=160)),
                ('error_message', models.CharField(blank=True, max_length=500)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='deliveries', to='shop.notificationevent')),
                ('seller', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='notification_deliveries', to='shop.sellerprofile')),
            ],
            options={
                'indexes': [models.Index(fields=['status', 'created_at'], name='shop_notify_status_created_idx')],
                'constraints': [models.UniqueConstraint(fields=('event', 'seller', 'channel'), name='shop_notify_once_channel')],
            },
        ),
    ]
