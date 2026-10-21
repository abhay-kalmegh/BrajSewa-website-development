from django.conf import settings
from django.db import models


class SellerProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='seller_profile', on_delete=models.CASCADE)
    display_name = models.CharField(max_length=160)
    business_name = models.CharField(max_length=180, blank=True)
    approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.display_name


class BuyerProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='buyer_profile', on_delete=models.CASCADE)
    phone = models.CharField(max_length=24, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=6, blank=True)


class Product(models.Model):
    seller = models.ForeignKey(SellerProfile, related_name='products', on_delete=models.PROTECT, null=True, blank=True)
    name = models.CharField(max_length=180)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=80, db_index=True, default='General')
    image_url = models.URLField(blank=True)
    price_paise = models.PositiveIntegerField()
    compare_at_price_paise = models.PositiveIntegerField(null=True, blank=True)
    inventory = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', '-created_at']
        constraints = [
            models.CheckConstraint(condition=models.Q(price_paise__gt=0), name='product_price_positive'),
        ]

    def __str__(self):
        return self.name


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed'
        EXPIRED = 'expired', 'Expired'
        FULFILLED = 'fulfilled', 'Fulfilled'
        CANCELLED = 'cancelled', 'Cancelled'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    email = models.EmailField()
    phone = models.CharField(max_length=24)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=6)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    subtotal_paise = models.PositiveIntegerField(default=0)
    shipping_paise = models.PositiveIntegerField(default=0)
    total_paise = models.PositiveIntegerField(default=0)
    razorpay_order_id = models.CharField(max_length=120, blank=True, unique=True, null=True)
    razorpay_payment_id = models.CharField(max_length=120, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['status', 'created_at'], name='shop_order_status_created_idx')]

    def __str__(self):
        return f'Order #{self.pk} ({self.status})'


class OrderLine(models.Model):
    order = models.ForeignKey(Order, related_name='lines', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    product_name = models.CharField(max_length=180, blank=True)  # snapshot at purchase time
    quantity = models.PositiveIntegerField()
    unit_price_paise = models.PositiveIntegerField()
