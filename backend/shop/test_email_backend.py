import json
import urllib.error
from email.message import EmailMessage as HttpEmailMessage
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from .email_backend import ResendEmailBackend, ResendEmailError
from django.contrib.auth import get_user_model


class FakeHTTPResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit=-1):
        return self.payload[:limit]


class ResendBackendTests(SimpleTestCase):
    def test_sends_plain_text_and_html_over_https_with_bearer_auth(self):
        message = EmailMultiAlternatives(
            "Verify your BrajSewa email",
            "Open the verification link",
            "BrajSewa <onboarding@resend.dev>",
            ["buyer@example.com"],
            reply_to=["support@example.com"],
        )
        message.attach_alternative("<p>Open the verification link</p>", "text/html")
        with patch("shop.email_backend.urllib.request.urlopen", return_value=FakeHTTPResponse({"id": "re_message_123"})) as urlopen:
            sent = ResendEmailBackend(api_key="re_test_secret").send_messages([message])

        self.assertEqual(sent, 1)
        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.full_url, "https://api.resend.com/emails")
        self.assertEqual(request.get_header("Authorization"), "Bearer re_test_secret")
        self.assertEqual(payload["from"], "BrajSewa <onboarding@resend.dev>")
        self.assertEqual(payload["to"], ["buyer@example.com"])
        self.assertEqual(payload["reply_to"], ["support@example.com"])
        self.assertEqual(payload["text"], "Open the verification link")
        self.assertEqual(payload["html"], "<p>Open the verification link</p>")

    def test_missing_api_key_is_a_configuration_error(self):
        message = EmailMultiAlternatives("Subject", "Body", "from@example.com", ["to@example.com"])
        with override_settings(RESEND_API_KEY=""):
            with self.assertRaisesMessage(ImproperlyConfigured, "RESEND_API_KEY is required"):
                ResendEmailBackend(api_key="").send_messages([message])

    def test_provider_http_errors_are_reported_without_exposing_the_api_key(self):
        message = EmailMultiAlternatives("Subject", "Body", "from@example.com", ["to@example.com"])
        error = urllib.error.HTTPError(
            "https://api.resend.com/emails", 422, "Unprocessable Entity", {},
            __import__("io").BytesIO(b'{"message":"Invalid from address"}'),
        )
        with patch("shop.email_backend.urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(ResendEmailError, "HTTP 422") as caught:
                ResendEmailBackend(api_key="re_secret_never_log").send_messages([message])
        self.assertNotIn("re_secret_never_log", str(caught.exception))

    def test_network_errors_are_reported_as_provider_connection_failures(self):
        message = EmailMultiAlternatives("Subject", "Body", "from@example.com", ["to@example.com"])
        with patch("shop.email_backend.urllib.request.urlopen", side_effect=urllib.error.URLError("network unreachable")):
            with self.assertRaisesRegex(ResendEmailError, "Could not connect to Resend"):
                ResendEmailBackend(api_key="re_test").send_messages([message])

    def test_fail_silently_returns_zero_when_provider_is_unavailable(self):
        message = EmailMultiAlternatives("Subject", "Body", "from@example.com", ["to@example.com"])
        with patch("shop.email_backend.urllib.request.urlopen", side_effect=OSError("offline")):
            sent = ResendEmailBackend(api_key="re_test", fail_silently=True).send_messages([message])
        self.assertEqual(sent, 0)

    def test_empty_message_list_is_a_noop(self):
        self.assertEqual(ResendEmailBackend(api_key="re_test").send_messages([]), 0)


@override_settings(
    EMAIL_BACKEND="shop.email_backend.ResendEmailBackend",
    RESEND_API_KEY="re_test",
    DEFAULT_FROM_EMAIL="BrajSewa <onboarding@resend.dev>",
    PUBLIC_SITE_URL="https://brajsewa-website-development-e8uuf26f.v0.build",
    SECURE_SSL_REDIRECT=False,
)
class ResendAuthFlowTests(APITestCase):
    def test_registration_returns_503_when_resend_cannot_deliver(self):
        with patch("shop.email_backend.urllib.request.urlopen", side_effect=urllib.error.URLError("offline")):
            response = self.client.post(
                "/api/v1/auth/register/",
                {"email": "new@example.com", "password": "correct-horse-9", "firstName": "New"},
                format="json",
            )
        self.assertEqual(response.status_code, 503)
        self.assertIn("could not send a verification email", response.data["detail"])
        user = get_user_model().objects.get(email="new@example.com")
        self.assertFalse(user.is_active)

    def test_resend_failure_keeps_non_enumerating_response(self):
        get_user_model().objects.create_user(
            username="pending@example.com", email="pending@example.com",
            password="correct-horse-9", is_active=False,
        )
        with patch("shop.email_backend.urllib.request.urlopen", side_effect=urllib.error.URLError("offline")):
            known = self.client.post(
                "/api/v1/auth/email-verification/resend/",
                {"email": "pending@example.com"}, format="json",
            )
        unknown = self.client.post(
            "/api/v1/auth/email-verification/resend/",
            {"email": "missing@example.com"}, format="json",
        )
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.data, unknown.data)
        self.assertNotIn("delivery failed", known.data["detail"].lower())
