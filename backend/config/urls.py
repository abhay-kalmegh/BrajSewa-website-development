from django.conf import settings
from django.contrib import admin
from django.urls import include, path

# /healthz/ and /readyz/ are answered by config.health.HealthCheckMiddleware (they must run before Host validation).
urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    # Auth routes live in shop.urls only. They were previously registered twice
    # (here and in shop.urls), so the unthrottled copy here always won.
    path('api/v1/', include('shop.urls')),
]
