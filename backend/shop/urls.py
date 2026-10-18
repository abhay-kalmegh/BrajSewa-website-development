from django.urls import path
from .payments import RazorpayVerifyView, RazorpayWebhookView
from rest_framework_simplejwt.views import TokenObtainPairView
from .views import CreateOrderView, MeView, OrderDetailView, ProductListView, RegisterView, SellerProductListCreateView

urlpatterns = [
    path('products/', ProductListView.as_view(), name='products'),
    path('auth/token/', TokenObtainPairView.as_view(), name='token'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('account/me/', MeView.as_view(), name='account-me'),
    path('seller/products/', SellerProductListCreateView.as_view(), name='seller-products'),
    path('orders/', CreateOrderView.as_view(), name='orders-create'),
    path('orders/<int:id>/', OrderDetailView.as_view(), name='orders-detail'),
    path('payments/razorpay/verify/', RazorpayVerifyView.as_view(), name='razorpay-verify'),
    path('payments/razorpay/webhook/', RazorpayWebhookView.as_view(), name='razorpay-webhook'),
]
