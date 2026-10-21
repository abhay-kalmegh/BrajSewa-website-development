from django.urls import path

from .payments import RazorpayVerifyView, RazorpayWebhookView
from .views import (CartMergeView, CartQuoteView, CartView, LoginView, LogoutView, MeView, OrderCollectionView,
                    OrderDetailView, ProductDetailView, ProductListView, RefreshView, RegisterView,
                    SellerProductListCreateView)

urlpatterns = [
    path('products/', ProductListView.as_view(), name='products'),
    path('products/<slug:slug>/', ProductDetailView.as_view(), name='product-detail'),
    path('cart/', CartView.as_view(), name='cart'),
    path('cart/quote/', CartQuoteView.as_view(), name='cart-quote'),
    path('cart/merge/', CartMergeView.as_view(), name='cart-merge'),
    path('auth/token/', LoginView.as_view(), name='token'),
    path('auth/token/refresh/', RefreshView.as_view(), name='token-refresh'),
    path('auth/token/blacklist/', LogoutView.as_view(), name='token-blacklist'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('account/me/', MeView.as_view(), name='account-me'),
    path('seller/products/', SellerProductListCreateView.as_view(), name='seller-products'),
    path('orders/', OrderCollectionView.as_view(), name='orders'),
    path('orders/<int:id>/', OrderDetailView.as_view(), name='orders-detail'),
    path('payments/razorpay/verify/', RazorpayVerifyView.as_view(), name='razorpay-verify'),
    path('payments/razorpay/webhook/', RazorpayWebhookView.as_view(), name='razorpay-webhook'),
]
