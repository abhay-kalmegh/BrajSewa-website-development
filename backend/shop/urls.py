from django.urls import path
from .payments import RazorpayVerifyView, RazorpayWebhookView
from .views import CreateOrderView, OrderDetailView, ProductListView

urlpatterns = [
    path('products/', ProductListView.as_view(), name='products'),
    path('orders/', CreateOrderView.as_view(), name='orders-create'),
    path('orders/<int:id>/', OrderDetailView.as_view(), name='orders-detail'),
    path('payments/razorpay/verify/', RazorpayVerifyView.as_view(), name='razorpay-verify'),
    path('payments/razorpay/webhook/', RazorpayWebhookView.as_view(), name='razorpay-webhook'),
]
