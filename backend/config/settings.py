import os
import warnings
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from config.logging_utils import logging_config


def env_bool(name, default):
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name, default=''):
    return [item.strip() for item in os.getenv(name, default).split(',') if item.strip()]


BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']
DEBUG = env_bool('DJANGO_DEBUG', False)

# Production refuses to start with weak or shared signing material. Generate keys with:
#   python -c "import secrets; print(secrets.token_urlsafe(64))"
JWT_SIGNING_KEY = os.environ.get('JWT_SIGNING_KEY') or (SECRET_KEY if DEBUG else None)
if not DEBUG:
    if len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 20:
        raise ImproperlyConfigured('DJANGO_SECRET_KEY is too weak: use at least 50 characters with real variety.')
    if not JWT_SIGNING_KEY:
        raise ImproperlyConfigured('JWT_SIGNING_KEY is required in production (a separate key, not DJANGO_SECRET_KEY).')
    if JWT_SIGNING_KEY == SECRET_KEY:
        raise ImproperlyConfigured('JWT_SIGNING_KEY must differ from DJANGO_SECRET_KEY, so one leaked key does not expose both.')
    if len(JWT_SIGNING_KEY) < 50 or len(set(JWT_SIGNING_KEY)) < 20:
        raise ImproperlyConfigured('JWT_SIGNING_KEY is too weak: use at least 50 characters with real variety.')
ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1')

INSTALLED_APPS = [
    'corsheaders', 'rest_framework', 'rest_framework_simplejwt.token_blacklist',
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'shop',
]
MIDDLEWARE = [
    'config.health.HealthCheckMiddleware',      # must stay FIRST: answers probes before Host validation
    'config.logging_utils.RequestIdMiddleware',  # every later log line carries the request id
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True,
              'OPTIONS': {'context_processors': ['django.template.context_processors.request',
                                                 'django.contrib.auth.context_processors.auth',
                                                 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
POSTGRES_SSLMODE = os.getenv('POSTGRES_SSLMODE', 'prefer')
DATABASES = {'default': {
    'ENGINE': 'django.db.backends.postgresql', 'NAME': os.getenv('POSTGRES_DB', ''),
    'USER': os.getenv('POSTGRES_USER', ''), 'PASSWORD': os.getenv('POSTGRES_PASSWORD', ''),
    'HOST': os.getenv('POSTGRES_HOST', ''), 'PORT': os.getenv('POSTGRES_PORT', '5432'),
    # Without CONN_MAX_AGE Django opens (and closes) a new PostgreSQL connection for EVERY request.
    'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
    'CONN_HEALTH_CHECKS': True,      # discard a connection that died (e.g. after an RDS failover) instead of erroring
    'OPTIONS': {'sslmode': POSTGRES_SSLMODE, 'connect_timeout': 5},
}}
if not DEBUG and POSTGRES_SSLMODE in ('disable', 'allow', 'prefer'):
    warnings.warn(f'POSTGRES_SSLMODE={POSTGRES_SSLMODE!r}: database traffic may be unencrypted. Use "require" (or '
                  '"verify-full") against RDS or any database not on a private single-host network.', RuntimeWarning)

# Authentication ------------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
SIMPLE_JWT = {
    'SIGNING_KEY': JWT_SIGNING_KEY,   # HS256; separate from SECRET_KEY
    'ISSUER': 'brajsewa-api',
    'AUDIENCE': 'brajsewa-web',
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    # Rotation is off on purpose: the Next.js proxy can refresh from several parallel requests,
    # and rotation + blacklisting would then log users out spuriously. Logout blacklists the
    # refresh token explicitly (auth/token/blacklist/).
    'ROTATE_REFRESH_TOKENS': False,
    'UPDATE_LAST_LOGIN': True,
}

# REST framework: secure by default, public endpoints opt in with AllowAny -------------------------
API_NUM_PROXIES = os.getenv('API_NUM_PROXIES') or None  # number of reverse proxies in front of Django (see README)
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_THROTTLE_CLASSES': ['shop.throttling.FailOpenScopedRateThrottle'],   # allows requests if the cache is down
    'DEFAULT_THROTTLE_RATES': {
        'auth': '20/min',          # per IP: login, register, refresh, logout
        'login_email': '8/min',    # per target account, regardless of IP
        'orders': '20/hour',       # per user
        'payments': '60/hour',     # per user
        'quote': '120/min',        # per IP: cart pricing (public)
        'cart': '240/min',         # per user: saved-cart sync
    },
}
if API_NUM_PROXIES is not None:
    REST_FRAMEWORK['NUM_PROXIES'] = int(API_NUM_PROXIES)
elif not DEBUG:
    warnings.warn('API_NUM_PROXIES is not set: DRF then trusts the whole X-Forwarded-For header, so per-IP rate limits '
                  'can be bypassed with a forged header. Set it to the number of proxies in front of Django.', RuntimeWarning)

# Throttle counters must be shared between gunicorn workers and survive restarts, so use Redis
# when REDIS_URL is set. The in-memory fallback is per-process and only suitable for development.
if os.getenv('REDIS_URL'):
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': os.environ['REDIS_URL']}}
else:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

# CORS / CSRF ---------------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS')
ADMIN_URL = os.getenv('DJANGO_ADMIN_PATH', 'admin/').strip('/') + '/'

# Transport security. Set DJANGO_HTTPS_ONLY=false only for local Docker/dev over plain HTTP. -------
HTTPS_ONLY = env_bool('DJANGO_HTTPS_ONLY', not DEBUG)
if not DEBUG and not HTTPS_ONLY and not env_bool('DJANGO_ALLOW_INSECURE_HTTP', False):
    raise ImproperlyConfigured('Refusing to start in production without HTTPS enforcement. Set DJANGO_HTTPS_ONLY=true '
                               '(or, for a local plain-HTTP run only, DJANGO_ALLOW_INSECURE_HTTP=true).')
if HTTPS_ONLY:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SECURE_REDIRECT_EXEMPT = [r'^healthz/$']
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_HSTS_SECONDS', '3600'))  # raise to 31536000 once stable
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'

# Static files (admin) -------------------------------------------------------------------------
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

LANGUAGE_CODE = 'en-in'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', '')
RAZORPAY_WEBHOOK_SECRET = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')

# A test key in production "sells" without taking money; a live key in development can charge real cards.
if not DEBUG and RAZORPAY_KEY_ID.startswith('rzp_test_') and not env_bool('RAZORPAY_ALLOW_TEST_KEYS', False):
    raise ImproperlyConfigured('A Razorpay TEST key is configured in a non-debug environment. Use live keys in production, '
                               'or set RAZORPAY_ALLOW_TEST_KEYS=true for staging.')
if DEBUG and RAZORPAY_KEY_ID.startswith('rzp_live_'):
    raise ImproperlyConfigured('A Razorpay LIVE key is configured with DJANGO_DEBUG=true. Use test keys in development.')

LOGGING = logging_config(os.getenv('LOG_LEVEL', 'INFO'))   # JSON lines with a request id, see config/logging_utils.py
