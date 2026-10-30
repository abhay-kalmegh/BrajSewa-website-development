"""Server-side pricing rules. The browser's totals are display-only; these are authoritative.

Keep in sync with the shipping rule shown in the UI (app/cart/page.tsx):
free shipping at or above Rs 499, otherwise Rs 49.
"""

FREE_SHIPPING_THRESHOLD_PAISE = 49_900
FLAT_SHIPPING_PAISE = 4_900


def shipping_for(subtotal_paise: int) -> int:
    return 0 if subtotal_paise >= FREE_SHIPPING_THRESHOLD_PAISE else FLAT_SHIPPING_PAISE
