from django.contrib import admin

from .models import BuyerProfile, Order, OrderLine, Product, SellerProfile


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price_paise', 'inventory', 'active', 'sort_order')
    # Price is deliberately NOT inline-editable: changing what customers pay should take opening the record, not one click
    # in a list. Every admin change is recorded in Django's LogEntry (who, what, when).
    list_editable = ('inventory', 'active', 'sort_order')
    list_filter = ('category', 'active')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(SellerProfile)
class SellerProfileAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'business_name', 'user', 'approved')
    list_filter = ('approved',)
    actions = ['approve_sellers', 'revoke_sellers']

    # Approval lets a seller publish products, so it is an explicit, logged action rather than an inline checkbox.
    def _set_approved(self, request, queryset, approved):
        changed = 0
        for seller in queryset.exclude(approved=approved):
            seller.approved = approved
            seller.save(update_fields=['approved'])
            self.log_change(request, seller, f'approved set to {approved}')
            changed += 1
        self.message_user(request, f'{changed} seller(s) {"approved" if approved else "revoked"}.')

    @admin.action(description='Approve selected sellers', permissions=['change'])
    def approve_sellers(self, request, queryset):
        self._set_approved(request, queryset, True)

    @admin.action(description='Revoke approval of selected sellers', permissions=['change'])
    def revoke_sellers(self, request, queryset):
        self._set_approved(request, queryset, False)


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
    # `status` is read-only: it is driven by verified payments and the expiry job. If staff could edit it, one person could
    # mark an unpaid order "paid" and have goods shipped with no payment. The only manual transition is the action below.
    readonly_fields = ('status', 'razorpay_order_id', 'razorpay_payment_id', 'subtotal_paise', 'shipping_paise',
                       'total_paise', 'paid_at', 'created_at', 'updated_at')
    inlines = [OrderLineInline]
    actions = ['mark_fulfilled']

    def has_add_permission(self, request):
        return False        # orders are created by customers through checkout, never by hand

    def has_delete_permission(self, request, obj=None):
        return False        # orders are financial records

    @admin.action(description='Mark selected PAID orders as shipped (fulfilled)', permissions=['change'])
    def mark_fulfilled(self, request, queryset):
        moved = skipped = 0
        for order in queryset:
            if order.status != Order.Status.PAID:
                skipped += 1
                continue
            order.status = Order.Status.FULFILLED
            order.save(update_fields=['status', 'updated_at'])
            self.log_change(request, order, 'Marked fulfilled (paid -> fulfilled)')    # audit trail: queryset.update() would skip it
            moved += 1
        self.message_user(request, f'{moved} order(s) marked fulfilled; {skipped} skipped because they were not paid.')
