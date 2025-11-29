from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "event_type",
        "channel",
        "status",
        "created_at",
        "sent_at",
    )
    list_filter = ("event_type", "channel", "status", "created_at")
    search_fields = ("title", "message", "user__username", "user__email")
