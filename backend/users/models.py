from django.db import models
from django.contrib.auth.models import User


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ("client", "Client"),
        ("admin", "Admin"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="client")
    phone = models.CharField(max_length=20, blank=True, null=True)
    telegram_username = models.CharField(max_length=255, blank=True, null=True)
    telegram_chat_id = models.BigIntegerField(blank=True, null=True)
    company = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class UserNotificationSettings(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="notification_settings"
    )
    notify_email = models.BooleanField(default=True)
    notify_telegram = models.BooleanField(default=False)
    notify_types = models.CharField(
        max_length=255,
        default="booking_created,booking_updated,booking_cancelled,reminder",
        help_text="Список типов уведомлений через запятую",
    )

    def __str__(self):
        return f"Notification settings for {self.user.username}"
