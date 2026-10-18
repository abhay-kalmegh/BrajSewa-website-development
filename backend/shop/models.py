from django.conf import settings
from django.db import models

class SellerProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='seller_profile', on_delete=models.CASCADE)
    display_name = models.CharField(max_length=160)
    business_name = models.CharField(max_length=180, blank=True)
    approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

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
    price_paise = models.PositiveIntegerField()
    inventory = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed'
        FULFILLED = 'fulfilled', 'Fulfilled'
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    email = models.EmailField()
    phone = models.CharField(max_length=24)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    total_paise = models.PositiveIntegerField(default=0)
    razorpay_order_id = models.CharField(max_length=120, blank=True, unique=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

class OrderLine(models.Model):
    order = models.ForeignKey(Order, related_name='lines', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_price_paise = models.PositiveIntegerField()
