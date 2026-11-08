"""Run periodic database maintenance and seller notification delivery jobs."""
import subprocess
import sys
import time


def run(*args):
    # A failed provider or maintenance command must not stop later scheduler passes.
    subprocess.run([sys.executable, 'manage.py', *args], check=False)


def main():
    minute = 0
    while True:
        run('process_notification_outbox', '--limit', '100')
        minute += 1
        if minute % 5 == 0:
            run('expire_orders', '--minutes', '30')
        if minute % 60 == 0:
            run('reconcile_payments')
        if minute % 1440 == 0:
            run('flushexpiredtokens')
        time.sleep(60)


if __name__ == '__main__':
    main()
