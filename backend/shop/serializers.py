from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Order, OrderLine, Product
from .validators import PIN_CODE_PATTERN, clean_details, is_allowed_image


# ============================================================
# PRODUCT SERIALIZERS
# ============================================================

class ProductSerializer(serializers.ModelSerializer):
    price = serializers.SerializerMethodField()
    compareAtPrice = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'slug',
            'description',
            'category',
            'image',
            'badge',
            'details',
            'price',
            'compareAtPrice',
            'inventory',
            'active',
        ]

    def get_price(self, obj):
        return obj.price_paise / 100

    def get_compareAtPrice(self, obj):
        return (
            obj.compare_at_price_paise / 100
            if obj.compare_at_price_paise
            else None
        )

    def get_image(self, obj):
        """
        Return uploaded image URL first.
        If no uploaded image exists, return the external image URL.
        """
        product_image = getattr(obj, 'image', None)

        if product_image:
            try:
                image_url = product_image.url
                request = self.context.get('request')

                if request:
                    return request.build_absolute_uri(image_url)

                return image_url
            except (ValueError, AttributeError):
                pass

        return getattr(obj, 'image_url', '') or ''


class SellerProductSerializer(serializers.ModelSerializer):
    """
    Writable serializer for seller dashboard.

    Supports:
    - Uploaded product images through ImageField.
    - External image URLs through image_url.
    """

    price_paise = serializers.IntegerField(min_value=1)

    compare_at_price_paise = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
    )

    image = serializers.ImageField(
        required=False,
        allow_null=True,
    )

    image_url = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
    )

    def validate_image_url(self, value):
        if value and not is_allowed_image(
            value,
            settings.ALLOWED_IMAGE_HOSTS,
        ):
            raise serializers.ValidationError(
                'Use an https image from an approved host, or a path on this site.'
            )

        return value

    def validate_details(self, value):
        try:
            return clean_details(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'slug',
            'description',
            'category',
            'image',
            'image_url',
            'badge',
            'details',
            'price_paise',
            'compare_at_price_paise',
            'inventory',
            'active',
        ]
        read_only_fields = ['id']


# ============================================================
# CUSTOMER AND CART INPUT SERIALIZERS
# ============================================================

class OrderLineInputSerializer(serializers.Serializer):
    productId = serializers.IntegerField()
    quantity = serializers.IntegerField(
        min_value=1,
        max_value=20,
    )


class CustomerSerializer(serializers.Serializer):
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=24)

    firstName = serializers.CharField(max_length=80)

    lastName = serializers.CharField(
        max_length=80,
        required=False,
        allow_blank=True,
    )

    address = serializers.CharField(max_length=500)
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100)

    postalCode = serializers.RegexField(
        PIN_CODE_PATTERN,
        error_messages={
            'invalid': 'Enter a valid 6-digit PIN code.'
        },
    )


class CreateOrderSerializer(serializers.Serializer):
    customer = CustomerSerializer()

    lines = OrderLineInputSerializer(
        many=True,
        allow_empty=False,
        max_length=50,
    )

    saveAddress = serializers.BooleanField(
        required=False,
        default=False,
    )


class CartLinesSerializer(serializers.Serializer):
    """
    Body for cart endpoints.
    Prices are always calculated by the server.
    """

    lines = OrderLineInputSerializer(
        many=True,
        allow_empty=True,
        max_length=50,
    )


# ============================================================
# ORDER SERIALIZERS
# ============================================================

class OrderLineSerializer(serializers.ModelSerializer):
    productId = serializers.IntegerField(source='product_id')
    slug = serializers.CharField(source='product.slug')

    name = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    unitPrice = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = [
            'productId',
            'slug',
            'name',
            'image',
            'quantity',
            'unitPrice',
        ]

    def get_name(self, obj):
        return obj.product_name or obj.product.name

    def get_image(self, obj):
        """
        Return uploaded image URL or external image URL.
        """

        product = obj.product
        product_image = getattr(product, 'image', None)

        if product_image:
            try:
                image_url = product_image.url

                request = self.context.get('request')

                if request:
                    return request.build_absolute_uri(image_url)

                return image_url

            except (ValueError, AttributeError):
                pass

        return getattr(product, 'image_url', '') or ''

    def get_unitPrice(self, obj):
        return obj.unit_price_paise / 100


class OrderSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    shipping = serializers.SerializerMethodField()

    lines = OrderLineSerializer(
        many=True,
        read_only=True,
    )

    shippingAddress = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id',
            'status',
            'subtotal',
            'shipping',
            'total',
            'razorpay_order_id',
            'paid_at',
            'created_at',
            'lines',
            'shippingAddress',
        ]

    def get_total(self, obj):
        return obj.total_paise / 100

    def get_subtotal(self, obj):
        return obj.subtotal_paise / 100

    def get_shipping(self, obj):
        return obj.shipping_paise / 100

    def get_shippingAddress(self, obj):
        return {
            'name': f'{obj.first_name} {obj.last_name}'.strip(),
            'phone': obj.phone,
            'email': obj.email,
            'address': obj.address,
            'city': obj.city,
            'state': obj.state,
            'postalCode': obj.postal_code,
        }


# ============================================================
# REGISTRATION SERIALIZER
# ============================================================

class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()

    password = serializers.CharField(
        min_length=8,
        max_length=128,
        write_only=True,
    )

    firstName = serializers.CharField(max_length=80)

    lastName = serializers.CharField(
        max_length=80,
        required=False,
        allow_blank=True,
    )

    phone = serializers.CharField(
        max_length=24,
        required=False,
        allow_blank=True,
    )

    role = serializers.ChoiceField(
        choices=['buyer', 'seller'],
        default='buyer',
    )

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        candidate = get_user_model()(
            username=attrs['email'],
            email=attrs['email'],
            first_name=attrs['firstName'],
            last_name=attrs.get('lastName', ''),
        )

        try:
            validate_password(
                attrs['password'],
                candidate,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({
                'password': list(exc.messages)
            })

        return attrs


# ============================================================
# PROFILE SERIALIZER
# ============================================================

class ProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField(source='pk')

    email = serializers.EmailField()

    role = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()

    firstName = serializers.CharField(source='first_name')
    lastName = serializers.CharField(source='last_name')

    phone = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()

    def get_role(self, obj):
        return 'seller' if hasattr(obj, 'seller_profile') else 'buyer'

    def get_name(self, obj):
        return obj.get_full_name() or obj.email

    def _buyer(self, obj):
        return getattr(obj, 'buyer_profile', None)

    def get_phone(self, obj):
        buyer = self._buyer(obj)
        return buyer.phone if buyer else ''

    def get_address(self, obj):
        """
        Return saved delivery address.
        Return null if the customer has not saved one.
        """

        buyer = self._buyer(obj)

        if not buyer or not buyer.address:
            return None

        return {
            'address': buyer.address,
            'city': buyer.city,
            'state': buyer.state,
            'postalCode': buyer.postal_code,
        }