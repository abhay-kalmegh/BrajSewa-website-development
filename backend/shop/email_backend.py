"""Django email backend for Resend's HTTPS API.

Configure EMAIL_BACKEND=shop.email_backend.ResendEmailBackend and RESEND_API_KEY.
No SMTP ports are used, so this works on hosts that restrict outbound SMTP.
"""
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)


class ResendEmailError(RuntimeError):
    """A message could not be accepted by Resend."""


class ResendEmailBackend(BaseEmailBackend):
    api_url = "https://api.resend.com/emails"

    def __init__(self, fail_silently=False, api_key=None, timeout=None, **kwargs):
        super().__init__(fail_silently=fail_silently)
        self.api_key = api_key if api_key is not None else getattr(settings, "RESEND_API_KEY", "")
        self.timeout = timeout if timeout is not None else getattr(settings, "EMAIL_TIMEOUT", 10)

    def _payload(self, message):
        if not message.to:
            raise ResendEmailError("Resend messages must include at least one To recipient.")
        if message.attachments:
            raise ResendEmailError("Resend backend does not support attachments yet.")

        payload = {
            "from": message.from_email or settings.DEFAULT_FROM_EMAIL,
            "to": list(message.to),
            "subject": message.subject,
            "text": message.body or "",
        }
        if message.cc:
            payload["cc"] = list(message.cc)
        if message.bcc:
            payload["bcc"] = list(message.bcc)
        if message.reply_to:
            payload["reply_to"] = list(message.reply_to)

        for content, mimetype in getattr(message, "alternatives", []):
            if mimetype == "text/html":
                payload["html"] = content
            elif mimetype == "text/plain":
                payload["text"] = content
        return payload

    def _send(self, message):
        if not self.api_key:
            raise ImproperlyConfigured("RESEND_API_KEY is required when using ResendEmailBackend.")

        request = urllib.request.Request(
            self.api_url,
            data=json.dumps(self._payload(message)).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "BrajSewa-Django/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                result = json.loads(response.read(16_384).decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # Do not include request headers or the API key in logs/errors.
            detail = exc.read(2_048).decode("utf-8", errors="replace")
            try:
                detail = json.loads(detail).get("message", "provider rejected the request")
            except (ValueError, AttributeError):
                detail = "provider rejected the request"
            raise ResendEmailError(f"Resend API returned HTTP {exc.code}: {str(detail)[:240]}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ResendEmailError(f"Could not connect to Resend: {type(exc).__name__}") from None

        if not isinstance(result, dict) or not result.get("id"):
            raise ResendEmailError("Resend did not return an accepted message ID.")
        return result["id"]

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        sent = 0
        for message in email_messages:
            try:
                self._send(message)
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
                logger.exception("Resend email delivery failed (fail_silently=True)")
        return sent
