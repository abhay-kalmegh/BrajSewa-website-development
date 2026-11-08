"""Server-side cart logic: pricing, stock clamping, merging and persistence.

The browser only ever sends product ids and quantities. Names, prices and availability are looked
up here, so a tampered localStorage cart cannot change what a customer is charged.
"""
from collections import OrderedDict

from django.db import transaction
from django.db.models import Q

from .models import Cart, CartItem, Product
from .pricing import shipping_for

MAX_LINE_QUANTITY = 20  # same cap the order API enforces per line

# The custom-box builder always includes one selection from each of these groups.
# Keep this validation server-side: the browser's cart can be edited by the customer.
CUSTOM_BOX_REQUIRED_GROUPS = (
    frozenset({'tulsi-japa-mala', 'kanthi-mala'}),
    frozenset({'mogra-ittar', 'sandal-ittar'}),
    frozenset({'yellow-chandan', 'red-chandan'}),
)


def has_valid_custom_box(wanted, products):
    """Return False if the hidden packing SKU is present without the required box contents."""
    packing_ids = [pid for pid, product in products.items()
                   if product.slug == 'seva-box-packing' and wanted.get(pid, 0) > 0]
    if not packing_ids:
        return True
    if len(packing_ids) != 1 or wanted.get(packing_ids[0]) != 1:
        return False

    selected_slugs = {product.slug for pid, product in products.items() if wanted.get(pid, 0) > 0}
    return all(selected_slugs.intersection(group) for group in CUSTOM_BOX_REQUIRED_GROUPS)


def merge_lines(*line_sets):
    """Combine several [{'productId', 'quantity'}] lists into {product_id: quantity}, summing duplicates."""
    wanted = OrderedDict()
    for lines in line_sets:
        for line in lines:
            pid = line['productId']
            wanted[pid] = min(MAX_LINE_QUANTITY, wanted.get(pid, 0) + line['quantity'])
    return wanted


def quote(wanted):
    """Price a {product_id: quantity} mapping against live catalog data.

    Each returned line carries `issue`: None, 'reduced' (fewer in stock than requested),
    'out_of_stock', or 'unavailable' (product removed/deactivated). Lines with an issue other
    than 'reduced' have quantity 0 and are not charged.
    """
    products = {p.id: p for p in Product.objects.filter(id__in=list(wanted), active=True).filter(Q(listed=True) | Q(slug='seva-box-packing'))}
    if not has_valid_custom_box(wanted, products):
        products = {pid: product for pid, product in products.items() if product.slug != 'seva-box-packing'}
    lines, subtotal = [], 0
    for pid, requested in wanted.items():
        product = products.get(pid)
        if product is None:
            lines.append({'productId': pid, 'slug': None, 'name': None, 'image': '', 'pricePaise': 0,
                          'quantity': 0, 'requestedQuantity': requested, 'inventory': 0, 'issue': 'unavailable'})
            continue
        allowed = min(requested, product.inventory, MAX_LINE_QUANTITY)
        issue = 'out_of_stock' if product.inventory == 0 else 'reduced' if allowed < requested else None
        subtotal += product.price_paise * allowed
        lines.append({'productId': pid, 'slug': product.slug, 'name': product.name, 'image': product.image.url if product.image else (product.image_url or ''),
                      'pricePaise': product.price_paise, 'quantity': allowed, 'requestedQuantity': requested,
                      'inventory': product.inventory, 'issue': issue})
    shipping = shipping_for(subtotal) if subtotal else 0
    return {'lines': lines, 'subtotalPaise': subtotal, 'shippingPaise': shipping, 'totalPaise': subtotal + shipping}


def stored_lines(user):
    cart = Cart.objects.filter(user=user).first()
    if cart is None:
        return []
    return [{'productId': item.product_id, 'quantity': item.quantity} for item in cart.items.order_by('id')]


def save_cart(user, quoted):
    """Persist the purchasable lines of a quote as the user's cart (replacing what was stored)."""
    with transaction.atomic():
        cart, _ = Cart.objects.get_or_create(user=user)
        cart.items.all().delete()
        CartItem.objects.bulk_create([CartItem(cart=cart, product_id=line['productId'], quantity=line['quantity'])
                                      for line in quoted['lines'] if line['quantity'] > 0])
        cart.save(update_fields=['updated_at'])
