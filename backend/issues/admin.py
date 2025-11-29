from django.contrib import admin
from .models import Issue, ResourceOutage


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ("id", "issue_type", "resource", "booking", "user", "status", "created_at")
    list_filter = ("issue_type", "status", "created_at")
    search_fields = ("description", "user__username", "resource__name")


@admin.register(ResourceOutage)
class ResourceOutageAdmin(admin.ModelAdmin):
    list_display = ("id", "resource", "start_datetime", "end_datetime", "reason", "created_at")
    list_filter = ("reason", "created_at")
