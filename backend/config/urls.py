from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path


def healthz(_request):
    return HttpResponse('ok', content_type='text/plain')


urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path(settings.ADMIN_URL, admin.site.urls),
    # Auth routes live in shop.urls only. They were previously registered twice
    # (here and in shop.urls), so the unthrottled copy here always won.
    path('api/v1/', include('shop.urls')),
]
