from rest_framework import serializers

from .models import Service, ServiceOrder
from bookings.models import Booking


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = [
            "id",
            "name",
            "description",
            "unit",
            "price",
            "is_active",
        ]


class ServiceOrderSerializer(serializers.ModelSerializer):
    service = ServiceSerializer(read_only=True)

    service_id = serializers.PrimaryKeyRelatedField(
        source="service",
        queryset=Service.objects.all(),
        write_only=True,
    )
    booking_id = serializers.PrimaryKeyRelatedField(
        source="booking",
        queryset=Booking.objects.all(),
        write_only=True,
    )

    class Meta:
        model = ServiceOrder
        fields = [
            "id",
            "booking",
            "booking_id",
            "service",
            "service_id",
            "quantity",
            "total_price",
            "created_at",
        ]
        read_only_fields = ["booking", "total_price", "created_at"]

    def create(self, validated_data):
        """
        При создании автоматически считаем total_price = service.price * quantity.
        """
        service: Service = validated_data["service"]
        quantity = validated_data.get("quantity") or 1

        validated_data["total_price"] = service.price * quantity
        return super().create(validated_data)
