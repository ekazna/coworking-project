from django.contrib import admin
from .models import Service, ServiceOrder


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "unit", "price", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(ServiceOrder)
class ServiceOrderAdmin(admin.ModelAdmin):
    list_display = ("id", "booking", "service", "quantity", "total_price", "created_at")
    list_filter = ("service",)
