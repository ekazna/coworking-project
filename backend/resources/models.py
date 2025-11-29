from django.db import models


class ResourceCategory(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name


class ResourceType(models.Model):
    category = models.ForeignKey(
        ResourceCategory, on_delete=models.CASCADE, related_name="types"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    monthly_rate = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)

    def __str__(self):
        return f"{self.category.code}: {self.name}"


class Resource(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("broken", "Broken"),
        ("maintenance", "Maintenance"),
    ]

    type = models.ForeignKey(
        ResourceType, on_delete=models.CASCADE, related_name="resources"
    )
    name = models.CharField(max_length=255)
    zone = models.CharField(max_length=255, blank=True, null=True)
    capacity = models.IntegerField(blank=True, null=True)  # для общих залов
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.type.name})"
