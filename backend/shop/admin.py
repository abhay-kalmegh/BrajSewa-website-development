from django.contrib import admin

from .models import BuyerProfile, Order, OrderLine, Product, SellerProfile


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price_paise', 'inventory', 'active', 'sort_order')
    list_editable = ('price_paise', 'inventory', 'active', 'sort_order')
    list_filter = ('category', 'active')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(SellerProfile)
class SellerProfileAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'business_name', 'user', 'approved')
    list_editable = ('approved',)
    list_filter = ('approved',)


@admin.register(BuyerProfile)
class BuyerProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'phone', 'city', 'state')


class OrderLineInline(admin.TabularInline):
    model = OrderLine
    extra = 0
    can_delete = False
    readonly_fields = ('product', 'product_name', 'quantity', 'unit_price_paise')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'email', 'status', 'total_paise', 'created_at')
    list_filter = ('status',)
    search_fields = ('email', 'phone', 'razorpay_order_id', 'razorpay_payment_id')
    readonly_fields = ('razorpay_order_id', 'razorpay_payment_id', 'subtotal_paise', 'shipping_paise',
                       'total_paise', 'paid_at', 'created_at', 'updated_at')
    inlines = [OrderLineInline]
