import unittest

from shop.reconcile import TooManyPayments, fetch_payments, find_discrepancies

NOW = 1_000_000
OLD = NOW - 3600          # an hour ago: well past the grace period
RECENT = NOW - 60         # a minute ago: the webhook may not have run yet


def pay(pid='pay_1', order='order_1', amount=34_800, status='captured', created=OLD):
    return {'id': pid, 'order_id': order, 'amount': amount, 'status': status, 'created_at': created}


def run(payments, orders, grace=600):
    return find_discrepancies(payments, orders, NOW, grace_seconds=grace)


class FindDiscrepanciesTests(unittest.TestCase):
    def test_a_healthy_payment_is_not_reported(self):
        for status in ('paid', 'fulfilled'):
            self.assertEqual(run([pay()], {'order_1': {'status': status, 'total_paise': 34_800}}), [])

    def test_only_captured_payments_count(self):
        orders = {'order_1': {'status': 'pending', 'total_paise': 34_800}}
        for status in ('created', 'authorized', 'failed', 'refunded'):
            self.assertEqual(run([pay(status=status)], orders), [], status)

    def test_charged_but_the_order_is_not_paid(self):
        for status in ('pending', 'failed', 'expired', 'cancelled'):
            out = run([pay()], {'order_1': {'status': status, 'total_paise': 34_800}})
            self.assertEqual([d['kind'] for d in out], ['order_not_paid'], status)
            self.assertIn(status, out[0]['detail'])

    def test_a_very_recent_payment_gets_a_grace_period(self):
        orders = {'order_1': {'status': 'pending', 'total_paise': 34_800}}
        self.assertEqual(run([pay(created=RECENT)], orders), [])                   # webhook may still be in flight
        self.assertEqual(len(run([pay(created=RECENT)], orders, grace=30)), 1)     # ...but not forever
        self.assertEqual(len(run([pay(created=NOW - 600)], orders)), 1)            # exactly at the boundary is reported

    def test_unknown_order_and_missing_order_id_are_reported_even_when_recent(self):
        self.assertEqual([d['kind'] for d in run([pay(order='order_x', created=RECENT)], {})], ['unknown_order'])
        self.assertEqual([d['kind'] for d in run([pay(order=None, created=RECENT)], {})], ['no_order'])

    def test_amount_mismatch_on_a_paid_order(self):
        out = run([pay(amount=100)], {'order_1': {'status': 'paid', 'total_paise': 34_800}})
        self.assertEqual([d['kind'] for d in out], ['amount_mismatch'])
        self.assertIn('100', out[0]['detail']); self.assertIn('34800', out[0]['detail'])

    def test_each_problem_carries_what_a_human_needs(self):
        d = run([pay(pid='pay_9', order='order_9', amount=500)], {})[0]
        self.assertEqual((d['payment_id'], d['razorpay_order_id'], d['amount']), ('pay_9', 'order_9', 500))

    def test_several_payments_are_judged_independently(self):
        orders = {'o1': {'status': 'paid', 'total_paise': 1}, 'o2': {'status': 'expired', 'total_paise': 2}}
        out = run([pay('p1', 'o1', 1), pay('p2', 'o2', 2), pay('p3', 'o3', 3)], orders)
        self.assertEqual(sorted(d['payment_id'] for d in out), ['p2', 'p3'])

    def test_missing_created_at_is_treated_as_old_not_as_a_crash(self):
        p = pay(); del p['created_at']
        self.assertEqual(len(run([p], {'order_1': {'status': 'pending', 'total_paise': 1}})), 1)


class FetchPaymentsTests(unittest.TestCase):
    def pages(self, total, size=3):
        calls = []
        def list_payments(options):
            calls.append(dict(options))
            start = options['skip']
            return {'items': [{'id': f'p{i}'} for i in range(start, min(start + options['count'], total))]}
        return list_payments, calls

    def test_follows_pagination_until_a_short_page(self):
        fn, calls = self.pages(7)
        self.assertEqual([p['id'] for p in fetch_payments(fn, 10, 20, page_size=3)], [f'p{i}' for i in range(7)])
        self.assertEqual([c['skip'] for c in calls], [0, 3, 6])
        self.assertTrue(all(c['from'] == 10 and c['to'] == 20 and c['count'] == 3 for c in calls))

    def test_an_exact_multiple_costs_one_extra_empty_call_and_loses_nothing(self):
        fn, calls = self.pages(6)
        self.assertEqual(len(list(fetch_payments(fn, 0, 1, page_size=3))), 6)
        self.assertEqual(len(calls), 3)

    def test_no_payments(self):
        fn, _ = self.pages(0)
        self.assertEqual(list(fetch_payments(fn, 0, 1)), [])

    def test_a_missing_items_key_is_an_empty_page(self):
        self.assertEqual(list(fetch_payments(lambda options: {}, 0, 1)), [])

    def test_a_runaway_window_stops_instead_of_looping_forever(self):
        with self.assertRaises(TooManyPayments):
            list(fetch_payments(lambda o: {'items': [{'id': 'x'}] * o['count']}, 0, 1, page_size=2, max_pages=3))


if __name__ == '__main__':
    unittest.main()
