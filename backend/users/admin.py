from django.contrib import admin
from .models import UserProfile, UserNotificationSettings


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "role", "phone", "company")
    list_filter = ("role",)


@admin.register(UserNotificationSettings)
class UserNotificationSettingsAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "notify_email", "notify_telegram")
