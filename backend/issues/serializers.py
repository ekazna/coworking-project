from rest_framework import serializers
from django.contrib.auth.models import User

from .models import Issue, ResourceOutage
from bookings.models import Booking
from resources.models import Resource


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class IssueSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)

    booking_id = serializers.PrimaryKeyRelatedField(
        source="booking",
        queryset=Booking.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    resource_id = serializers.PrimaryKeyRelatedField(
        source="resource",
        queryset=Resource.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Issue
        fields = [
            "id",
            "issue_type",
            "description",
            "status",
            "user",         # короткая инфа о пользователе
            "booking",      # read-only объект
            "booking_id",   # write-only ID
            "resource",     # read-only объект
            "resource_id",  # write-only ID
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "user",
            "booking",
            "resource",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        # user и status подставляем во view через serializer.save(...)
        return super().create(validated_data)



class ResourceShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = ["id", "name", "capacity", "status"]


class IssueShortForOutageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Issue
        fields = ["id", "issue_type", "status", "created_at"]


class ResourceOutageSerializer(serializers.ModelSerializer):
    """
    Период недоступности ресурса.

    - resource_id / issue_id — для записи
    - resource / issue — для удобного чтения
    - capacity_reduction — сколько «мест» временно убираем из capacity ресурса
    """

    resource = ResourceShortSerializer(read_only=True)
    resource_id = serializers.PrimaryKeyRelatedField(
        source="resource",
        queryset=Resource.objects.all(),
        write_only=True,
    )

    issue = IssueShortForOutageSerializer(read_only=True)
    issue_id = serializers.PrimaryKeyRelatedField(
        source="issue",
        queryset=Issue.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ResourceOutage
        fields = [
            "id",
            "resource",
            "resource_id",
            "issue",
            "issue_id",
            "start_datetime",
            "end_datetime",
            "reason",
            "capacity_reduction",
            "created_at",
        ]
        read_only_fields = ["resource", "issue", "created_at"]

    def validate(self, attrs):
        """
        Общие проверки:
        - end > start
        - capacity_reduction >= 0
        - если у ресурса есть capacity, то capacity_reduction не больше capacity
        """
        # достаём уже привязанный объект + то, что пришло
        resource = attrs.get("resource") or getattr(self.instance, "resource", None)
        start = attrs.get("start_datetime") or getattr(self.instance, "start_datetime", None)
        end = attrs.get("end_datetime") or getattr(self.instance, "end_datetime", None)
        cap_red = attrs.get("capacity_reduction") if "capacity_reduction" in attrs else getattr(self.instance, "capacity_reduction", 0)

        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_datetime": "Время окончания должно быть позже времени начала."}
            )

        if cap_red is None:
            cap_red = 0

        if cap_red < 0:
            raise serializers.ValidationError(
                {"capacity_reduction": "Уменьшение capacity не может быть отрицательным."}
            )

        # если ресурс указан и у него есть capacity — ограничим сверху
        if resource and resource.capacity is not None and cap_red > resource.capacity:
            raise serializers.ValidationError(
                {
                    "capacity_reduction": (
                        f"Нельзя уменьшить capacity больше, чем текущая вместимость ресурса "
                        f"({resource.capacity})."
                    )
                }
            )

        return attrs
