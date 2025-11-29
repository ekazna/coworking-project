from rest_framework import serializers
from django.contrib.auth.models import User
from django.db.models import Q

from .models import Booking
from resources.models import Resource
from resources.serializers import ResourceSerializer
from issues.models import Issue
from issues.serializers import IssueSerializer


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]


class BookingSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)     # user только read-only

    resource = ResourceSerializer(read_only=True)
    resource_id = serializers.PrimaryKeyRelatedField(
        source="resource",
        queryset=Resource.objects.all(),
        write_only=True,
    )

    class Meta:
        model = Booking
        fields = [
            "id",
            "user",
            "resource",
            "resource_id",
            "booking_type",
            "time_format",
            "start_datetime",
            "end_datetime",
            "status",
            "parent_booking",
            "parent_relation_type",
            "created_at",
        ]
        read_only_fields = ["status", "created_at"]

    def validate(self, attrs):
        """
        Общая валидация:
        - end > start
        - для почасовой брони время кратно 15 минутам
        - пересечения по ресурсу
        - учёт capacity (общие зоны)
        """
        instance = getattr(self, "instance", None)

        start = attrs.get("start_datetime") or (
            instance.start_datetime if instance else None
        )
        end = attrs.get("end_datetime") or (
            instance.end_datetime if instance else None
        )
        resource = attrs.get("resource") or (
            instance.resource if instance else None
        )
        time_format = attrs.get("time_format") or (
            instance.time_format if instance else None
        )

        # базовая проверка: конец > начало
        if start and end and end <= start:
            raise serializers.ValidationError(
                "Время окончания должно быть позже времени начала."
            )

        # только почасовые брони — по сетке 15 минут
        if time_format == "hour" and start and end:
            for dt in (start, end):
                if (
                    dt.minute % 15 != 0
                    or dt.second != 0
                    or dt.microsecond != 0
                ):
                    raise serializers.ValidationError(
                        "Почасовые бронирования возможны только с шагом 15 минут "
                        "(минуты 00, 15, 30 или 45)."
                    )

        # если чего-то нет — пока дальше не проверяем
        if not resource or not start or not end:
            return attrs

        # пересечения
        qs = Booking.objects.filter(
            resource=resource,
            status__in=["active", "conflicted"],
        )
        if instance:
            qs = qs.exclude(id=instance.id)

        overlapping_qs = qs.filter(
            Q(start_datetime__lt=end) & Q(end_datetime__gt=start)
        )

        # ресурс без capacity — фиксированное место / переговорка
        if resource.capacity is None:
            if overlapping_qs.exists():
                raise serializers.ValidationError(
                    "На указанный интервал ресурс уже забронирован. "
                    "Пожалуйста, выберите другое время."
                )
            return attrs

        # ресурс с capacity — общий зал
        current_count = overlapping_qs.count()
        if current_count >= resource.capacity:
            raise serializers.ValidationError(
                f"На указанный интервал достигнут лимит по количеству "
                f"одновременных бронирований ({resource.capacity}). "
                f"Пожалуйста, выберите другое время."
            )

        return attrs



class BookingChildSerializer(serializers.ModelSerializer):
    resource = ResourceSerializer(read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "booking_type",
            "time_format",
            "start_datetime",
            "end_datetime",
            "status",
            "resource",
            "parent_relation_type",
        ]


class BookingDetailSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)
    resource = ResourceSerializer(read_only=True)

    # дочерние брони (оборудование и т.п.)
    children = BookingChildSerializer(
        many=True,
        read_only=True,
        source="child_bookings",
    )

    # связанные обращения по этой брони
    issues = IssueSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = Booking
        fields = [
            "id",
            "user",
            "booking_type",
            "time_format",
            "start_datetime",
            "end_datetime",
            "status",
            "resource",
            "parent_booking",
            "parent_relation_type",
            "children",
            "issues",
            "created_at",
        ]