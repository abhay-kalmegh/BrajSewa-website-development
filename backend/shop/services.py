"""Order lifecycle helpers. Every function here is safe to call more than once."""
import logging

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Order, Product

logger = logging.getLogger(__name__)

# How long an unpaid order may hold stock. Used by expire_orders and by checkout's order reuse.
PENDING_ORDER_TTL_MINUTES = 30


def release_order(order_id, new_status):
    """Return reserved stock for a still-pending order and move it to `new_status`.

    Returns True if the order was released, False if it was not pending (already paid,
    already released, ...). Row-locks the order so a concurrent payment confirmation
    and an expiry run cannot both win.
    """
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order_id)
        if order.status != Order.Status.PENDING:
            return False
        for line in order.lines.all():
            Product.objects.filter(pk=line.product_id).update(inventory=F('inventory') + line.quantity)
        order.status = new_status
        order.save(update_fields=['status', 'updated_at'])
        return True


def mark_paid(razorpay_order_id, payment_id, amount_paise=None):
    """Confirm payment for an order. Idempotent; returns the Order or None.

    None means the payment could NOT be applied (unknown order, amount mismatch, or the order
    was already released). Those cases are logged at ERROR level and need manual review/refund.
    """
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(razorpay_order_id=razorpay_order_id).first()
        if order is None:
            logger.error('Payment %s received for unknown Razorpay order %s', payment_id, razorpay_order_id)
            return None
        if order.status in (Order.Status.PAID, Order.Status.FULFILLED):
            return order
        if amount_paise is not None and amount_paise != order.total_paise:
            logger.error('Amount mismatch on order %s: paid %s, expected %s (payment %s)',
                         order.id, amount_paise, order.total_paise, payment_id)
            return None
        if order.status != Order.Status.PENDING:
            logger.error('MANUAL REVIEW: payment %s arrived for %s order %s; stock was already released',
                         payment_id, order.status, order.id)
            return None
        order.status = Order.Status.PAID
        order.razorpay_payment_id = payment_id or ''
        order.paid_at = timezone.now()
        order.save(update_fields=['status', 'razorpay_payment_id', 'paid_at', 'updated_at'])
        return order
