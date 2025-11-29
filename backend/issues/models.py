from django.db import models
from django.contrib.auth.models import User

from bookings.models import Booking
from resources.models import Resource


class Issue(models.Model):
    ISSUE_TYPE_CHOICES = [
        ("workspace", "Рабочее место"),
        ("equipment", "Оборудование"),
    ]

    STATUS_CHOICES = [
        ("new", "Новая"),
        ("confirmed", "Подтверждена"),
        ("rejected", "Отклонена"),
        ("resolved", "Решена"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="issues")
    booking = models.ForeignKey(
        Booking,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
        help_text="Бронь, в рамках которой возникла проблема",
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
        help_text="Конкретный ресурс (рабочее место или оборудование)",
    )

    issue_type = models.CharField(max_length=20, choices=ISSUE_TYPE_CHOICES)
    description = models.TextField()

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Issue #{self.id} ({self.get_issue_type_display()})"




class ResourceOutage(models.Model):
    """
    Период недоступности ресурса (на обслуживании / сломан).
    Теперь outage может уменьшать capacity ресурса — важно для общих залов.
    """

    OUTAGE_REASON_CHOICES = [
        ("issue", "Неисправность по обращению пользователя"),
        ("maintenance", "Плановое обслуживание"),
    ]

    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name="outages",
    )

    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()

    reason = models.CharField(
        max_length=20,
        choices=OUTAGE_REASON_CHOICES,
        default="issue",
    )

    issue = models.ForeignKey(
        "issues.Issue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outages",
        help_text="Заявка, по которой создан этот период недоступности",
    )

    capacity_reduction = models.PositiveIntegerField(
        default=1,
        help_text="На сколько единиц уменьшается capacity ресурса на этот период",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return (
            f"Outage #{self.id} for {self.resource} "
            f"({self.start_datetime} - {self.end_datetime}, "
            f"reduction={self.capacity_reduction})"
        )
