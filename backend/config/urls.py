"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from bookings.views import BookingViewSet
from issues.views import IssueViewSet, ResourceOutageViewSet
from services.views import ServiceViewSet, ServiceOrderViewSet
from notifications.views import NotificationViewSet
from resources.views import (
    ResourceCategoryViewSet,
    ResourceTypeViewSet,
    ResourceViewSet,
    ResourceAvailableView,
)
from users.views import (
    RegisterView,
    LoginView,
    LogoutView,
    UserAdminViewSet,
    UserMeView,
    ChangePasswordView,
    AdminUserDetailView, 
)
from notifications.telegram_webhook import telegram_webhook

router = DefaultRouter()
router.register(r"resource-categories", ResourceCategoryViewSet, basename="resource-category")
router.register(r"resource-types", ResourceTypeViewSet, basename="resource-type")
router.register(r"resources", ResourceViewSet, basename="resource")
router.register(r"bookings", BookingViewSet, basename="booking")
router.register(r"issues", IssueViewSet, basename="issue")
router.register(r"resource-outages", ResourceOutageViewSet, basename="resource-outage")
router.register(r"services", ServiceViewSet, basename="service")
router.register(r"service-orders", ServiceOrderViewSet, basename="service-order")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"admin/users", UserAdminViewSet, basename="admin-users")

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/auth/register/", RegisterView.as_view(), name="api-register"),
    path("api/auth/login/", LoginView.as_view(), name="api-login"),
    path("api/auth/logout/", LogoutView.as_view(), name="api-logout"),

    path("api/users/me/", UserMeView.as_view(), name="user-me"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="api-change-password"),

    path(
        "api/resources/available/",
        ResourceAvailableView.as_view(),
        name="resources-available",
    ),

    path(
        "api/users/<int:user_id>/admin-detail/",
        AdminUserDetailView.as_view(),
        name="admin-user-detail",
    ),

    path("api/", include(router.urls)),
    path("telegram/webhook/", telegram_webhook, name="telegram-webhook"),
]
