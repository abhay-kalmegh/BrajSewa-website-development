"""Compare Razorpay's captured payments with our orders. Framework-free, so the decisions are unit-testable.

The browser callback and the webhook normally mark an order paid within seconds. This is the safety net behind them: if
BOTH are lost (tab closed + webhook misconfigured, an outage, a bug), a customer has been charged for an order we never
confirmed. Finding that is a human job (refund or fulfil), so this module only reports.
"""
PAID_STATUSES = frozenset({'paid', 'fulfilled'})


class TooManyPayments(Exception):
    pass


def find_discrepancies(payments, orders, now, grace_seconds=600):
    """`payments`: Razorpay payment dicts. `orders`: {razorpay_order_id: {'status': str, 'total_paise': int}}.
    `now`: current unix time. A payment younger than `grace_seconds` is skipped, because the webhook may simply not
    have been processed yet. Returns a list of {'kind', 'payment_id', 'razorpay_order_id', 'amount', 'detail'}."""
    found = []
    for payment in payments:
        if payment.get('status') != 'captured':
            continue                                    # authorised, failed, or refunded: not money we are holding
        order_id = payment.get('order_id')
        record = {'payment_id': payment.get('id'), 'razorpay_order_id': order_id, 'amount': payment.get('amount')}
        if not order_id:
            found.append({**record, 'kind': 'no_order', 'detail': 'captured payment carries no Razorpay order id'})
            continue
        order = orders.get(order_id)
        if order is None:
            found.append({**record, 'kind': 'unknown_order', 'detail': 'no order in our database for this Razorpay order'})
        elif order['status'] not in PAID_STATUSES:
            if now - int(payment.get('created_at') or 0) >= grace_seconds:
                found.append({**record, 'kind': 'order_not_paid', 'detail': f"customer was charged but the order is '{order['status']}'"})
        elif payment.get('amount') != order['total_paise']:
            found.append({**record, 'kind': 'amount_mismatch', 'detail': f"charged {payment.get('amount')} but the order total is {order['total_paise']}"})
    return found


def fetch_payments(list_payments, since, until, page_size=100, max_pages=50):
    """Yield every payment in [since, until]. `list_payments(options)` is razorpay's `client.payment.all`."""
    skip = 0
    for _ in range(max_pages):
        batch = list_payments({'from': since, 'to': until, 'count': page_size, 'skip': skip}).get('items', [])
        yield from batch
        if len(batch) < page_size:
            return
        skip += page_size
    raise TooManyPayments(f'more than {max_pages * page_size} payments in the window; use a shorter --hours')
