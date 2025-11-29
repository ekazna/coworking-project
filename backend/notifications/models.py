from django.db import models
from django.contrib.auth.models import User

from bookings.models import Booking
from issues.models import Issue
from services.models import ServiceOrder


class Notification(models.Model):
    """
    Лог уведомлений — внутренние, email, телеграм и системные.
    Фактическая отправка выполняется через utils (telegram/email).
    """

    EVENT_TYPE_CHOICES = [
        # Бронирования
        ("booking_created", "Создано бронирование"),
        ("booking_extended", "Продлено бронирование"),
        ("booking_cancelled", "Отменено бронирование"),
        ("booking_reassigned", "Бронирование перенесено на другой ресурс"),
        ("booking_conflicted", "Бронирование в конфликте"),

        # Обращения (issues)
        ("issue_created", "Создано обращение о проблеме"),
        ("issue_confirmed", "Обращение подтверждено администратором"),
        ("issue_rejected", "Обращение отклонено администратором"),

        # Заказы услуг
        ("service_order_created", "Создан заказ услуги"),
    ]

    CHANNEL_CHOICES = [
        ("email", "Email"),
        ("telegram", "Telegram"),
        ("internal", "Внутреннее уведомление"),
        ("system", "Системное уведомление"),  # для внутренних/служебных
    ]

    STATUS_CHOICES = [
        ("pending", "Ожидает отправки"),
        ("sent", "Отправлено"),
        ("failed", "Ошибка при отправке"),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    event_type = models.CharField(
        max_length=50,
        choices=EVENT_TYPE_CHOICES,
    )

    channel = models.CharField(
        max_length=20,
        choices=CHANNEL_CHOICES,
        default="internal",
    )

    # привязка к объектам системы (необязательная)
    booking = models.ForeignKey(
        Booking,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    issue = models.ForeignKey(
        Issue,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    service_order = models.ForeignKey(
        ServiceOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )

    title = models.CharField(max_length=255)
    message = models.TextField()

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return (
            f"Notification #{self.id} → {self.user.username} "
            f"({self.event_type}, {self.channel})"
        )
