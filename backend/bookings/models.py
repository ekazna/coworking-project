from django.db import models
from django.contrib.auth.models import User
from resources.models import Resource


class Booking(models.Model):
    BOOKING_TYPE_CHOICES = [
        ("workspace", "Workspace"),
        ("equipment", "Equipment"),
        ("service", "Service"),
        ("parking", "Parking"),
        ("locker", "Locker"),
    ]

    TIME_FORMAT_CHOICES = [
        ("hour", "By hour"),
        ("day", "By day"),
        ("month", "By month"),
    ]

    STATUS_CHOICES = [
        ("active", "Active"),
        ("cancelled", "Cancelled"),
        ("finished", "Finished"),
        ("conflicted", "Conflicted"),  # на случай поломок / outage
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="bookings")
    resource = models.ForeignKey(
        Resource, on_delete=models.CASCADE, related_name="bookings"
    )
    booking_type = models.CharField(max_length=20, choices=BOOKING_TYPE_CHOICES)
    time_format = models.CharField(max_length=20, choices=TIME_FORMAT_CHOICES)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    parent_booking = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="child_bookings",
        blank=True,
        null=True,
    )
    parent_relation_type = models.CharField(
        max_length=50, blank=True, null=True, help_text="Тип связи с родительской бронью"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Booking #{self.id} by {self.user} for {self.resource}"


class BookingChangeLog(models.Model):
    CHANGE_TYPE_CHOICES = [
        ("extend", "Extend"),
        ("cancel", "Cancel"),
        ("move", "Move"),
        ("update", "Update"),
    ]

    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="changes"
    )
    change_type = models.CharField(max_length=50, choices=CHANGE_TYPE_CHOICES)
    old_start = models.DateTimeField(blank=True, null=True)
    old_end = models.DateTimeField(blank=True, null=True)
    new_start = models.DateTimeField(blank=True, null=True)
    new_end = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Change {self.change_type} for booking #{self.booking_id}"
