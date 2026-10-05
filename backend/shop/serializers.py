from rest_framework import serializers
from .models import Order, Product

class ProductSerializer(serializers.ModelSerializer):
    price = serializers.SerializerMethodField()
    class Meta:
        model = Product
        fields = ['id', 'name', 'slug', 'description', 'price']
    def get_price(self, obj):
        return obj.price_paise / 100

class OrderLineInputSerializer(serializers.Serializer):
    productId = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=20)

class CustomerSerializer(serializers.Serializer):
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=24)
    firstName = serializers.CharField(max_length=80)
    lastName = serializers.CharField(max_length=80, required=False, allow_blank=True)
    address = serializers.CharField(max_length=500)
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100)
    postalCode = serializers.RegexField(r'^\\d{6}$')

class CreateOrderSerializer(serializers.Serializer):
    customer = CustomerSerializer()
    lines = OrderLineInputSerializer(many=True, allow_empty=False)

class OrderSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()
    class Meta:
        model = Order
        fields = ['id', 'status', 'total', 'razorpay_order_id', 'created_at']
    def get_total(self, obj):
        return obj.total_paise / 100
