from django.contrib import admin
from .models import ResourceCategory, ResourceType, Resource


@admin.register(ResourceCategory)
class ResourceCategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name")
    search_fields = ("code", "name")


@admin.register(ResourceType)
class ResourceTypeAdmin(admin.ModelAdmin):
    list_display = ("id", "category", "name", "hourly_rate", "daily_rate", "monthly_rate")
    list_filter = ("category",)
    search_fields = ("name",)


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "type", "zone", "capacity", "status")
    list_filter = ("type", "status", "zone")
    search_fields = ("name",)
