from django.urls import path

from .payments import RazorpayVerifyView, RazorpayWebhookView
from .views import (CreateOrderView, LoginView, LogoutView, MeView, OrderDetailView, ProductListView,
                    RefreshView, RegisterView, SellerProductListCreateView)

urlpatterns = [
    path('products/', ProductListView.as_view(), name='products'),
    path('auth/token/', LoginView.as_view(), name='token'),
    path('auth/token/refresh/', RefreshView.as_view(), name='token-refresh'),
    path('auth/token/blacklist/', LogoutView.as_view(), name='token-blacklist'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('account/me/', MeView.as_view(), name='account-me'),
    path('seller/products/', SellerProductListCreateView.as_view(), name='seller-products'),
    path('orders/', CreateOrderView.as_view(), name='orders-create'),
    path('orders/<int:id>/', OrderDetailView.as_view(), name='orders-detail'),
    path('payments/razorpay/verify/', RazorpayVerifyView.as_view(), name='razorpay-verify'),
    path('payments/razorpay/webhook/', RazorpayWebhookView.as_view(), name='razorpay-webhook'),
]
