from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import (
    IsAdminUser,
    IsAuthenticated,
    IsAuthenticatedOrReadOnly,
)
from rest_framework.decorators import action
from django.utils.dateparse import parse_datetime
from django.utils import timezone

import datetime
import calendar

from bookings.models import Booking
from .models import Resource, ResourceCategory, ResourceType
from .serializers import (
    ResourceCategorySerializer,
    ResourceTypeSerializer,
    ResourceSerializer,
)
from issues.models import ResourceOutage


# ==========================================================
# ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ — вычисление effective_capacity
# ==========================================================

def get_effective_capacity(resource, start_dt, end_dt):
    """Возвращает (effective_capacity, free_capacity, overlap_count)."""

    # базовая вместимость
    base_capacity = resource.capacity if resource.capacity is not None else 1

    # уменьшение по outage
    outages = ResourceOutage.objects.filter(
        resource=resource,
        start_datetime__lt=end_dt,
        end_datetime__gt=start_dt,
    )

    total_reduction = sum(o.capacity_reduction or 0 for o in outages)
    effective_capacity = base_capacity - total_reduction

    if effective_capacity <= 0:
        return 0, 0, 0  # полностью недоступен

    # пересекающиеся активные брони
    overlapping = Booking.objects.filter(
        resource=resource,
        status__in=["active", "conflicted"],
        start_datetime__lt=end_dt,
        end_datetime__gt=start_dt,
    )

    overlap_count = overlapping.count()
    free_capacity = max(effective_capacity - overlap_count, 0)

    if free_capacity <= 0:
        return effective_capacity, 0, overlap_count

    return effective_capacity, free_capacity, overlap_count



class ResourceCategoryViewSet(viewsets.ModelViewSet):
    queryset = ResourceCategory.objects.all().order_by("id")
    serializer_class = ResourceCategorySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]



class ResourceTypeViewSet(viewsets.ModelViewSet):
    queryset = ResourceType.objects.select_related("category").all().order_by("id")
    serializer_class = ResourceTypeSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]



class ResourceViewSet(viewsets.ModelViewSet):
    queryset = (
        Resource.objects.select_related("type", "type__category")
        .all()
        .order_by("id")
    )
    serializer_class = ResourceSerializer
    permission_classes = [IsAdminUser]

    def get_permissions(self):
        """GET доступны обычным пользователям; создание/редактирование — только админам."""
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        return [IsAdminUser()]


    @action(
        detail=False,
        methods=["get"],
        url_path="available",
        permission_classes=[IsAuthenticated],
    )
    def available(self, request):
        """
        Главный эндпоинт определения доступных ресурсов.
        Возвращает:
          - ресурс
          - free_capacity
          - effective_capacity
        """
        booking_type = request.query_params.get("booking_type", "workspace")
        time_format = request.query_params.get("time_format", "hour")

        start_str = request.query_params.get("start_datetime")
        end_str = request.query_params.get("end_datetime")
        start_date_str = request.query_params.get("start_date")

        # --- вычисление интервала ---
        if time_format == "month" and start_date_str and not (start_str or end_str):
            try:
                d = datetime.date.fromisoformat(start_date_str)
            except ValueError:
                return Response(
                    {"detail": "Некорректная дата start_date. Ожидается YYYY-MM-DD."},
                    status=400,
                )

            start_dt = datetime.datetime.combine(d, datetime.time.min)

            # плюс один месяц
            if d.month == 12:
                year, month = d.year + 1, 1
            else:
                year, month = d.year, d.month + 1

            last_day = calendar.monthrange(year, month)[1]
            end_date = datetime.date(year, month, min(d.day, last_day))
            end_dt = datetime.datetime.combine(end_date, datetime.time.min)

        else:
            if not start_str or not end_str:
                return Response(
                    {"detail": "start_datetime и end_datetime обязательны."},
                    status=400,
                )

            start_dt = parse_datetime(start_str)
            end_dt = parse_datetime(end_str)

            if start_dt is None or end_dt is None:
                return Response(
                    {"detail": "Неверный формат дат, ожидается ISO 8601."},
                    status=400,
                )

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt)
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt)

        if end_dt <= start_dt:
            return Response(
                {"detail": "Время окончания должно быть позже начала."},
                status=400,
            )

        # выбираем активные ресурсы нужного типа
        qs = Resource.objects.filter(status="active")
        if booking_type:
            qs = qs.filter(type__category__code=booking_type)

        results = []

        for res in qs:
            effective_capacity, free_capacity, overlap_count = \
                get_effective_capacity(res, start_dt, end_dt)

            if free_capacity > 0:
                data = ResourceSerializer(res).data
                data["effective_capacity"] = effective_capacity
                data["free_capacity"] = free_capacity
                results.append(data)

        return Response(results)


# СТАРЫЙ ЭНДПОИНТ Логика аналогична available().
class ResourceAvailableView(APIView):

    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request):
        start = request.GET.get("start_datetime")
        end = request.GET.get("end_datetime")
        booking_type = request.GET.get("booking_type")

        if not (start and end and booking_type):
            return Response(
                {"error": "start_datetime, end_datetime, booking_type обязательны"},
                status=400,
            )

        start_dt = parse_datetime(start)
        end_dt = parse_datetime(end)

        if start_dt is None or end_dt is None:
            return Response(
                {"error": "Неверный формат дат (ISO 8601 required)."},
                status=400,
            )

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt)
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt)

        if end_dt <= start_dt:
            return Response(
                {"error": "end_datetime должно быть позже start_datetime"},
                status=400,
            )

        qs = Resource.objects.filter(
            type__category__code=booking_type,
            status="active",
        )

        results = []

        for res in qs:
            effective_capacity, free_capacity, overlap_count = \
                get_effective_capacity(res, start_dt, end_dt)

            if free_capacity > 0:
                data = ResourceSerializer(res).data
                data["effective_capacity"] = effective_capacity
                data["free_capacity"] = free_capacity
                results.append(data)

        return Response(results)
