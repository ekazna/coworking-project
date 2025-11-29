from django.db import models
from bookings.models import Booking


class Service(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    unit = models.CharField(max_length=50, help_text="Единица измерения, напр. шт, стр.")
    price = models.DecimalField(max_digits=10, decimal_places=2)

    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class ServiceOrder(models.Model):
    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="service_orders"
    )
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name="orders"
    )
    quantity = models.IntegerField()
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)


    def __str__(self):
        return f"Order #{self.id}: {self.service} x {self.quantity}"
