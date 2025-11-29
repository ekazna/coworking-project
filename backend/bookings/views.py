from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError

from django.utils import timezone
from django.utils.dateparse import parse_datetime

import datetime
from datetime import timedelta

from .models import Booking, BookingChangeLog
from resources.models import Resource, ResourceType
from issues.models import ResourceOutage
from .serializers import BookingSerializer, BookingDetailSerializer

from notifications.utils import create_notification, format_dt
from .utils import round_to_next_15
from django.db import transaction

from issues.models import Issue

# рабочие часы коворкинга
WORKDAY_START_HOUR = 6   # 06:00
WORKDAY_END_HOUR = 23    # 23:00


def check_working_hours(start_dt: datetime.datetime, end_dt: datetime.datetime):
    """
    Простое правило рабочих часов:
    - начало не раньше 06:00;
    - окончание не позже 23:00.
    """
    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
    if timezone.is_naive(end_dt):
        end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

    if end_dt <= start_dt:
        raise ValueError("Время окончания должно быть позже времени начала.")

    start_time = start_dt.timetz()
    end_time = end_dt.timetz()

    if start_time.hour < WORKDAY_START_HOUR:
        raise ValueError("Начало бронирования возможно только с 06:00.")
    if end_time.hour > WORKDAY_END_HOUR or (
        end_time.hour == WORKDAY_END_HOUR and
        (end_time.minute > 0 or end_time.second > 0 or end_time.microsecond > 0)
    ):
        raise ValueError("Окончание бронирования возможно не позднее 23:00.")


class BookingViewSet(viewsets.ModelViewSet):
    """
    Бронирования рабочих мест, оборудования, услуг и т.д.
    """

    queryset = (
        Booking.objects
        .select_related("user", "resource", "parent_booking")
        .prefetch_related("child_bookings")
        .all()
        .order_by("-start_datetime")
    )
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    # -------------------------------------------------------------------------
    # ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    # -------------------------------------------------------------------------

    def get_queryset(self):
        """
        staff видит все брони, обычный пользователь – только свои.
        Плюс фильтры ?status=, ?booking_type=, ?user_id=
        """
        user = self.request.user
        params = self.request.query_params

        qs = (
            Booking.objects
            .select_related("user", "resource", "parent_booking")
            .prefetch_related("child_bookings")
            .all()
            .order_by("-start_datetime")
        )

        if not user.is_staff:
            qs = qs.filter(user=user)

        status_param = params.get("status")
        booking_type_param = params.get("booking_type")
        user_id_param = params.get("user_id")

        if status_param:
            qs = qs.filter(status=status_param)

        if booking_type_param:
            qs = qs.filter(booking_type=booking_type_param)

        if user_id_param:
            qs = qs.filter(user_id=user_id_param)

        return qs

    @action(
        detail=False,
        methods=["get"],
        url_path="my",
        permission_classes=[IsAuthenticated],
    )
    def my_bookings(self, request):
        """
        Список броней текущего пользователя.
        ?status=active|cancelled|conflicted|finished
        """
        qs = self.get_queryset().filter(user=request.user)

        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        serializer = BookingSerializer(qs, many=True)
        return Response(serializer.data)

    
    
    def _allocate_equipment_resources(
        self,
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        equipment_items,
    ):
        """
        Общая логика подбора свободного оборудования.

        equipment_items: список словарей
        [
          {"resource_type_id": <int>, "quantity": <int>},
          ...
        ]

        Возвращает список структур:
        [
          {
            "type": <ResourceType>,
            "resources": [<Resource>, <Resource>, ...]  # длиной quantity
          },
          ...
        ]

        Если чего-то не хватает — кидает ValidationError, НИЧЕГО не создаёт.
        """
        if not equipment_items:
            return []

        # нормализуем вход: может прийти dict, может – список
        if isinstance(equipment_items, dict):
            # допустим формат {"resource_type_id": 5, "quantity": 2}
            equipment_items = [equipment_items]

        allocated = []

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

        for item in equipment_items:
            try:
                rtype_id = int(item.get("resource_type_id"))
                quantity = int(item.get("quantity", 0))
            except (TypeError, ValueError):
                raise ValidationError(
                    {"detail": "Неверный формат списка оборудования."}
                )

            if quantity <= 0:
                raise ValidationError(
                    {"detail": "Количество оборудования должно быть больше нуля."}
                )

            try:
                equipment_type = ResourceType.objects.get(id=rtype_id)
            except ResourceType.DoesNotExist:
                raise ValidationError(
                    {"detail": f"Тип оборудования с id={rtype_id} не найден."}
                )

            candidates = Resource.objects.filter(
                type=equipment_type,
                status="active",
            )

            if not candidates.exists():
                raise ValidationError(
                    {
                        "detail": (
                            f"Нет доступных ресурсов для типа оборудования "
                            f"'{equipment_type.name}'."
                        )
                    }
                )

            # ресурсы, занятые пересекающимися бронированиями 
            busy_ids = set(
                Booking.objects.filter(
                    resource__in=candidates,
                    status__in=["active", "conflicted"],
                    start_datetime__lt=end_dt,
                    end_datetime__gt=start_dt,
                )
                .values_list("resource_id", flat=True)
                .distinct()
            )

            # ресурсы, выведенные из работы outage'ами 
            outages = ResourceOutage.objects.filter(
                resource__in=candidates,
                start_datetime__lt=end_dt,
                end_datetime__gt=start_dt,
            )

            reduction_by_resource: dict[int, int] = {}
            for o in outages:
                reduction_by_resource[o.resource_id] = (
                    reduction_by_resource.get(o.resource_id, 0)
                    + (o.capacity_reduction or 0)
                )

            fully_unavailable_ids = set()
            for res in candidates:
                base_capacity = res.capacity if res.capacity is not None else 1
                total_reduction = reduction_by_resource.get(res.id, 0)
                effective_capacity = base_capacity - total_reduction
                # если effective_capacity <= 0 — ресурс на этот период полностью недоступен
                if effective_capacity <= 0:
                    fully_unavailable_ids.add(res.id)

            busy_ids.update(fully_unavailable_ids)

            free_qs = candidates.exclude(id__in=busy_ids)

            if free_qs.count() < quantity:
                raise ValidationError(
                    {
                        "detail": (
                            f"Недостаточно свободного оборудования типа "
                            f"'{equipment_type.name}'. "
                            f"Запрошено: {quantity}, доступно: {free_qs.count()}."
                        )
                    }
                )

            allocated.append(
                {
                    "type": equipment_type,
                    "resources": list(free_qs[:quantity]),
                }
            )

        return allocated



    # -------------------------------------------------------------------------
    # УМНОЕ БРОНИРОВАНИЕ ФИКСИРОВАННЫХ МЕСТ (+ ОПЦИОНАЛЬНОЕ ОБОРУДОВАНИЕ)
    # -------------------------------------------------------------------------

    @action(
        detail=False,
        methods=["post"],
        url_path="create-fixed",
        permission_classes=[IsAuthenticated],
    )
    def create_fixed(self, request):
        """
        Создание брони для фиксированных рабочих мест.

        Клиент НЕ выбирает конкретный стол.

        Ожидает:
        {
          "resource_type_id": <id типа "фиксированное рабочее место">,
          "time_format": "hour" | "day" | "month",
          "start_datetime": "...",
          "end_datetime": "...",
          "equipment": [
            {"resource_type_id": <id типа оборудования>, "quantity": <int>},
            ...
          ]  // опционально
        }

        Алгоритм:
        1) Валидируем даты + рабочие часы.
        2) Находим свободные ресурсы заданного типа.
        3) Для каждого свободного стола считаем "окно" вокруг интервала
           и выбираем стол с МИНИМАЛЬНЫМ окном.
        4) Если передано "equipment" — проверяем доступность ВСЕГО оборудования
           через _allocate_equipment_resources (без создания броней).
        5) В одной транзакции:
             - создаём основную бронь на выбранный стол;
             - создаём дочерние брони на оборудование.
        """
        resource_type_id = request.data.get("resource_type_id")
        time_format = request.data.get("time_format", "hour")
        start_str = request.data.get("start_datetime")
        end_str = request.data.get("end_datetime")
        equipment_items = request.data.get("equipment")  # может быть None

        if not resource_type_id:
            return Response(
                {"detail": "Не указан resource_type_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not start_str or not end_str:
            return Response(
                {"detail": "Необходимо передать start_datetime и end_datetime."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str)

        if start_dt is None or end_dt is None:
            return Response(
                {
                    "detail": (
                        "Неверный формат дат. Используйте ISO 8601, например "
                        "2025-11-24T10:00:00."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

        # проверка рабочих часов
        try:
            check_working_hours(start_dt, end_dt)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # тип фиксированного рабочего места
        try:
            rtype = ResourceType.objects.get(id=resource_type_id)
        except ResourceType.DoesNotExist:
            return Response(
                {"detail": "Тип ресурса с указанным ID не найден."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # кандидаты – все активные ресурсы этого типа
        candidates = Resource.objects.filter(type=rtype, status="active")

        if not candidates.exists():
            return Response(
                {"detail": "Нет активных ресурсов заданного типа."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ресурсы, СВОБОДНЫЕ в указанный интервал
        free_resources = []
        for res in candidates:
            overlapping = Booking.objects.filter(
                resource=res,
                status__in=["active", "conflicted"],
                start_datetime__lt=end_dt,
                end_datetime__gt=start_dt,
            )
            if overlapping.exists():
                continue
            free_resources.append(res)

        if not free_resources:
            return Response(
                {
                    "detail": "Нет свободных фиксированных рабочих мест на указанный интервал."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # рабочий день по дате начала
        day_date = start_dt.date()
        work_start = timezone.make_aware(
            datetime.datetime.combine(
                day_date, datetime.time(hour=WORKDAY_START_HOUR)
            ),
            timezone.get_current_timezone(),
        )
        work_end = timezone.make_aware(
            datetime.datetime.combine(
                day_date, datetime.time(hour=WORKDAY_END_HOUR)
            ),
            timezone.get_current_timezone(),
        )

        def free_window_around_interval(res: Resource) -> float:
            """
            Окно свободного времени вокруг [start_dt, end_dt) для ресурса res.
            Чем меньше окно, тем "плотнее" упаковано бронирование.
            """
            prev_booking = (
                Booking.objects.filter(
                    resource=res,
                    status__in=["active", "conflicted"],
                    end_datetime__lte=start_dt,
                    end_datetime__gt=work_start,
                )
                .order_by("-end_datetime")
                .first()
            )

            next_booking = (
                Booking.objects.filter(
                    resource=res,
                    status__in=["active", "conflicted"],
                    start_datetime__gte=end_dt,
                    start_datetime__lt=work_end,
                )
                .order_by("start_datetime")
                .first()
            )

            window_start = work_start
            if prev_booking:
                window_start = max(window_start, prev_booking.end_datetime)

            window_end = work_end
            if next_booking:
                window_end = min(window_end, next_booking.start_datetime)

            if window_end <= window_start:
                return float("inf")

            return (window_end - window_start).total_seconds()

        # выбираем стол с минимальным свободным окном
        best_resource = None
        best_window = float("inf")

        for res in free_resources:
            window = free_window_around_interval(res)
            if window < best_window:
                best_window = window
                best_resource = res

        if best_resource is None:
            return Response(
                {"detail": "Не удалось подобрать подходящее рабочее место."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # если запрошено оборудование — сначала проверяем его наличие (без создания)
        try:
            allocated_equipment = self._allocate_equipment_resources(
                start_dt, end_dt, equipment_items
            )
        except ValidationError as e:
            # НИ одной брони ещё не создано — просто возвращаем ошибку
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)

        # всё ок: создаём основную бронь и дочерние брони оборудования в одной транзакции
        with transaction.atomic():
            payload = {
                "resource_id": best_resource.id,
                "booking_type": "workspace",
                "time_format": time_format,
                "start_datetime": start_dt,
                "end_datetime": end_dt,
            }

            serializer = BookingSerializer(
                data=payload,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            booking = serializer.save(user=request.user)

            # создаём дочерние брони на оборудование
            for item in allocated_equipment:
                for res in item["resources"]:
                    Booking.objects.create(
                        user=request.user,
                        resource=res,
                        booking_type="equipment",
                        time_format=booking.time_format,
                        start_datetime=booking.start_datetime,
                        end_datetime=booking.end_datetime,
                        status="active",
                        parent_booking=booking,
                        parent_relation_type="equipment",
                    )

            create_notification(
                user=request.user,
                event_type="booking_created",
                title="Бронирование создано",
                message=(
                    f"Ваше бронирование ресурса '{booking.resource}' "
                    f"с {format_dt(booking.start_datetime)} по {format_dt(booking.end_datetime)} успешно создано."
                ),
                booking=booking,
            )

        return Response(
            BookingDetailSerializer(booking).data,
            status=status.HTTP_201_CREATED,
        )

    # -------------------------------------------------------------------------
    # ПРОДЛЕНИЕ БРОНИ
    # -------------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="extend")
    def extend_booking(self, request, pk=None):
        """
        Проверка возможности продлить бронь:
        - desired_end_datetime
        - учитываем рабочие часы и пересечения.
        """
        booking = self.get_object()
        resource = booking.resource

        desired_end = request.data.get("desired_end_datetime")
        if not desired_end:
            return Response(
                {"detail": "Необходимо передать поле desired_end_datetime."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        desired_end_dt = parse_datetime(desired_end)
        if desired_end_dt is None:
            return Response(
                {
                    "detail": (
                        "Неверный формат даты. Используйте ISO 8601, например: "
                        "2025-11-18T18:00:00"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(desired_end_dt):
            desired_end_dt = timezone.make_aware(
                desired_end_dt,
                timezone.get_current_timezone(),
            )

        # рабочие часы
        try:
            check_working_hours(booking.start_datetime, desired_end_dt)
        except ValueError as e:
            return Response(
                {
                    "can_extend": False,
                    "max_end_datetime": booking.end_datetime,
                    "reason": str(e),
                },
                status=status.HTTP_200_OK,
            )

        if desired_end_dt <= booking.end_datetime:
            return Response(
                {
                    "can_extend": False,
                    "max_end_datetime": booking.end_datetime,
                    "reason": "Желаемое время окончания не позже текущего.",
                },
                status=status.HTTP_200_OK,
            )

        next_booking = (
            Booking.objects.filter(
                resource=resource,
                status__in=["active", "conflicted"],
                start_datetime__gte=booking.end_datetime,
            )
            .exclude(id=booking.id)
            .order_by("start_datetime")
            .first()
        )

        if next_booking is None:
            return Response(
                {
                    "can_extend": True,
                    "max_end_datetime": desired_end_dt,
                    "reason": "Ресурс свободен до указанного времени.",
                },
                status=status.HTTP_200_OK,
            )

        if next_booking.start_datetime >= desired_end_dt:
            return Response(
                {
                    "can_extend": True,
                    "max_end_datetime": desired_end_dt,
                    "reason": "Ресурс свободен до указанного времени.",
                },
                status=status.HTTP_200_OK,
            )

        max_end = next_booking.start_datetime

        if max_end <= booking.end_datetime:
            return Response(
                {
                    "can_extend": False,
                    "max_end_datetime": booking.end_datetime,
                    "reason": "Ресурс занят сразу после текущей брони, продление невозможно.",
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "can_extend": False,
                "max_end_datetime": max_end,
                "reason": "Ресурс занят другим пользователем. Можно продлить только до указанного времени.",
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="extend-confirm")
    def extend_confirm(self, request, pk=None):
        """
        Подтверждение продления:
        - new_end_datetime
        - валидация + рабочие часы + логирование.
        """
        booking = self.get_object()

        new_end_str = request.data.get("new_end_datetime")
        if not new_end_str:
            return Response(
                {"detail": "Необходимо передать поле new_end_datetime."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_end_dt = parse_datetime(new_end_str)
        if new_end_dt is None:
            return Response(
                {
                    "detail": (
                        "Неверный формат new_end_datetime. Используйте ISO 8601, например: "
                        "2025-11-18T18:00:00"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(new_end_dt):
            new_end_dt = timezone.make_aware(
                new_end_dt, timezone.get_current_timezone()
            )

        try:
            check_working_hours(booking.start_datetime, new_end_dt)
        except ValueError as e:
            return Response(
                {"detail": str(e), "current_end_datetime": booking.end_datetime},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_end_dt <= booking.end_datetime:
            return Response(
                {
                    "detail": "Новое время окончания должно быть позже текущего времени окончания брони.",
                    "current_end_datetime": booking.end_datetime,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = {"end_datetime": new_end_dt}
        serializer = self.get_serializer(instance=booking, data=data, partial=True)
        serializer.is_valid(raise_exception=True)

        old_start = booking.start_datetime
        old_end = booking.end_datetime

        updated_booking = serializer.save()

        BookingChangeLog.objects.create(
            booking=updated_booking,
            change_type="extend",
            old_start=old_start,
            old_end=old_end,
            new_start=updated_booking.start_datetime,
            new_end=updated_booking.end_datetime,
        )

        create_notification(
            user=booking.user,
            event_type="booking_extended",
            title="Бронирование продлено",
            message=(
                f"Ваше бронирование ресурса '{booking.resource}' было продлено "
                f"до {booking.end_datetime}."
            ),
            booking=booking,
        )

        return Response(
            self.get_serializer(updated_booking).data,
            status=status.HTTP_200_OK,
        )


    
        # ===== ВНУТРЕННИЙ ХЕЛПЕР ДЛЯ ПРОДЛЕНИЯ НА КОНКРЕТНОМ РЕСУРСЕ =====
    def _compute_extension_for_resource(self, resource, base_start, desired_end):
        """
        Считает, до какого момента максимум можно продлить интервал
        [base_start, desired_end) на указанном ресурсе, учитывая другие брони.

        Возвращает dict:
        {
          "max_end": datetime,
          "can_full": bool,   # true, если можно прямо до desired_end
        }
        """

        # ближайшая бронь на этом ресурсе после base_start
        next_booking = (
            Booking.objects.filter(
                resource=resource,
                status__in=["active", "conflicted"],
                start_datetime__gte=base_start,
            )
            .order_by("start_datetime")
            .first()
        )

        if not next_booking:
            # никого дальше нет — можем идти до желаемого конца
            return {
                "max_end": desired_end,
                "can_full": True,
            }

        if next_booking.start_datetime >= desired_end:
            # ближайшая бронь начинается уже после желаемого конца —
            # весь интервал свободен
            return {
                "max_end": desired_end,
                "can_full": True,
            }

        # есть пересечение — можно лишь до начала следующей брони
        max_end = next_booking.start_datetime

        # если вдруг ближайшая бронь начинается прямо в base_start или раньше —
        # продлить вообще нельзя
        if max_end <= base_start:
            return {
                "max_end": base_start,
                "can_full": False,
            }

        return {
            "max_end": max_end,
            "can_full": False,
        }

    # ===== СЛОЖНЫЕ ОПЦИИ ПРОДЛЕНИЯ БРОНИ =====
    @action(detail=True, methods=["post"], url_path="extend-options")
    def extend_options(self, request, pk=None):
        """
        Возвращает варианты продления брони с учётом других ресурсов.

        Вход:
        {
          "desired_end_datetime": "2025-11-25T18:00:00"
        }

        Выход (примерная структура):
        {
          "requested_end": "...",
          "current_end": "...",

          "same_resource": {
            "can_full": true/false,
            "max_end": "...",
            "reason": "..."
          },

          "same_type_other_resource": {
            "can_any": true/false,
            "can_full": true/false,
            "resource_id": 5,
            "resource_name": "Стол 5",
            "max_end": "...",
            "reason": "..."
          },

          "other_workspace_resource": {
            "can_any": true/false,
            "can_full": true/false,
            "resource_id": 7,
            "resource_name": "Гибкое рабочее место 2",
            "max_end": "...",
            "reason": "..."
          },

          "best_partial": {
            "exists": true/false,
            "source": "same_resource" | "same_type_other_resource" | "other_workspace_resource",
            "resource_id": null или id,
            "resource_name": "...",
            "max_end": "..."
          }
        }
        """
        booking = self.get_object()
        resource = booking.resource

        desired_end_str = request.data.get("desired_end_datetime")
        if not desired_end_str:
            return Response(
                {"detail": "Необходимо передать поле desired_end_datetime."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        desired_end_dt = parse_datetime(desired_end_str)
        if desired_end_dt is None:
            return Response(
                {
                    "detail": "Неверный формат desired_end_datetime. "
                              "Используйте ISO 8601, например: 2025-11-25T18:00:00"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(desired_end_dt):
            desired_end_dt = timezone.make_aware(
                desired_end_dt, timezone.get_current_timezone()
            )

        # Нельзя продлевать назад / на то же время
        if desired_end_dt <= booking.end_datetime:
            return Response(
                {
                    "detail": "Новое время окончания должно быть позже текущего.",
                    "current_end": booking.end_datetime,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # проверка рабочих часов (используем уже имеющийся хелпер)
        try:
            check_working_hours(booking.start_datetime, desired_end_dt)
        except ValueError as e:
            return Response(
                {
                    "detail": str(e),
                    "current_end": booking.end_datetime,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_start = booking.end_datetime

        # --- 1) тот же ресурс ---
        same_res_info = self._compute_extension_for_resource(
            resource, base_start, desired_end_dt
        )
        same_res_can_full = same_res_info["can_full"]
        same_res_reason = (
            "Полностью можно продлить на этом же месте."
            if same_res_can_full
            else (
                "Можно продлить на этом же месте лишь до "
                f"{same_res_info['max_end']}."
                if same_res_info["max_end"] > base_start
                else "На этом же месте продление невозможно."
            )
        )

        # --- готовим наборы кандидатов для других сценариев ---
        from resources.models import Resource as ResModel

        # ресурсы того же типа (тот же тип рабочего места), кроме текущего
        same_type_qs = ResModel.objects.filter(
            type=resource.type,
            status="active",
        ).exclude(id=resource.id)

        # любые другие workspace-ресурсы (другой type, но та же category)
        same_category_other_type_qs = ResModel.objects.filter(
            type__category=resource.type.category,
            status="active",
        ).exclude(type=resource.type)

        # --- 2) тот же тип ресурса, но другое рабочее место ---
        best_same_type = None
        best_same_type_max_end = None
        best_same_type_can_full = False

        for res2 in same_type_qs:
            info = self._compute_extension_for_resource(res2, base_start, desired_end_dt)
            max_end = info["max_end"]

            # если вообще нет продления (max_end == base_start) — пропускаем
            if max_end <= base_start:
                continue

            if best_same_type is None or max_end > best_same_type_max_end:
                best_same_type = res2
                best_same_type_max_end = max_end
                best_same_type_can_full = info["can_full"]

        if best_same_type is not None:
            same_type_any = True
            same_type_reason = (
                "Можно продлить на другом рабочем месте того же типа "
                "на весь запрошенный интервал."
                if best_same_type_can_full
                else "Можно продлить на другом рабочем месте того же типа "
                     f"лишь до {best_same_type_max_end}."
            )
        else:
            same_type_any = False
            same_type_reason = "Нет других свободных рабочих мест этого типа."

        # --- 3) другие workspace-ресурсы (другой тип) ---
        best_other_ws = None
        best_other_ws_max_end = None
        best_other_ws_can_full = False

        for res3 in same_category_other_type_qs:
            info = self._compute_extension_for_resource(res3, base_start, desired_end_dt)
            max_end = info["max_end"]

            if max_end <= base_start:
                continue

            if best_other_ws is None or max_end > best_other_ws_max_end:
                best_other_ws = res3
                best_other_ws_max_end = max_end
                best_other_ws_can_full = info["can_full"]

        if best_other_ws is not None:
            other_ws_any = True
            other_ws_reason = (
                "Нет мест того же типа, но можно продлить на другом типе рабочего места "
                "на весь запрошенный интервал."
                if best_other_ws_can_full
                else "Нет мест того же типа, но можно продлить на другом типе рабочего места "
                     f"лишь до {best_other_ws_max_end}."
            )
        else:
            other_ws_any = False
            other_ws_reason = (
                "Нет свободных рабочих мест других типов для продления "
                "в запрошенный интервал."
            )

        # --- 4) лучший частичный вариант, если полностью нельзя нигде ---
        # собираем все кандидаты > base_start
        candidates = []

        # тот же ресурс
        if same_res_info["max_end"] > base_start:
            candidates.append(
                (
                    "same_resource",
                    resource,
                    same_res_info["max_end"],
                )
            )

        # другой ресурс того же типа
        if best_same_type is not None and best_same_type_max_end > base_start:
            candidates.append(
                (
                    "same_type_other_resource",
                    best_same_type,
                    best_same_type_max_end,
                )
            )

        # другой workspace-ресурс
        if best_other_ws is not None and best_other_ws_max_end > base_start:
            candidates.append(
                (
                    "other_workspace_resource",
                    best_other_ws,
                    best_other_ws_max_end,
                )
            )

        best_partial = {
            "exists": False,
            "source": None,
            "resource_id": None,
            "resource_name": None,
            "max_end": None,
        }

        if candidates:
            # выбираем вариант с максимальным max_end
            source, res_best, max_end_best = max(candidates, key=lambda x: x[2])
            best_partial = {
                "exists": True,
                "source": source,
                "resource_id": res_best.id if res_best is not None else None,
                "resource_name": getattr(res_best, "name", None),
                "max_end": max_end_best,
            }

        result = {
            "requested_end": desired_end_dt,
            "current_end": booking.end_datetime,

            "same_resource": {
                "can_full": same_res_can_full,
                "max_end": same_res_info["max_end"],
                "reason": same_res_reason,
            },

            "same_type_other_resource": {
                "can_any": same_type_any,
                "can_full": best_same_type_can_full if same_type_any else False,
                "resource_id": best_same_type.id if best_same_type is not None else None,
                "resource_name": getattr(best_same_type, "name", None)
                if best_same_type is not None
                else None,
                "max_end": best_same_type_max_end if same_type_any else None,
                "reason": same_type_reason,
            },

            "other_workspace_resource": {
                "can_any": other_ws_any,
                "can_full": best_other_ws_can_full if other_ws_any else False,
                "resource_id": best_other_ws.id if best_other_ws is not None else None,
                "resource_name": getattr(best_other_ws, "name", None)
                if best_other_ws is not None
                else None,
                "max_end": best_other_ws_max_end if other_ws_any else None,
                "reason": other_ws_reason,
            },

            "best_partial": best_partial,
        }

        return Response(result, status=status.HTTP_200_OK)

    
    def _resource_available_for_period(
        self,
        resource: Resource,
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        exclude_booking_id=None,
    ) -> bool:
        """
        Проверяет, свободен ли ресурс на весь интервал [start_dt, end_dt)
        с учётом:
        - ResourceOutage (поломки/обслуживание);
        - пересекающихся броней и capacity.
        """
        # 1) если есть outage на этот период — ресурс недоступен
        has_outage = ResourceOutage.objects.filter(
            resource=resource,
            start_datetime__lt=end_dt,
            end_datetime__gt=start_dt,
        ).exists()
        if has_outage:
            return False

        # 2) считаем пересекающиеся брони (кроме текущей)
        overlapping = Booking.objects.filter(
            resource=resource,
            status__in=["active", "conflicted"],
            start_datetime__lt=end_dt,
            end_datetime__gt=start_dt,
        )
        if exclude_booking_id:
            overlapping = overlapping.exclude(id=exclude_booking_id)

        capacity = resource.capacity if resource.capacity is not None else 1
        return overlapping.count() < capacity


    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated],
        url_path="change-options",
    )
    def change_options(self, request, pk=None):
        """
        Варианты изменения бронирования после поломки.

        Для booking_type=workspace:
          - ищем ресурсы ЛЮБОГО типа в той же категории (workspace),
          - если ресурс общий (capacity > 1), можем предложить и его самого,
            если по нему остаётся свободная вместимость.
        Для booking_type=equipment:
          - ищем ресурсы того же типа (как раньше).
        """
        booking = self.get_object()
        user = request.user

        # владелец или админ
        if (booking.user != user) and (not user.is_staff):
            return Response(
                {"detail": "Недостаточно прав для просмотра вариантов изменения."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if booking.booking_type not in ("workspace", "equipment"):
            return Response(
                {"detail": "Изменение для этого типа бронирования не поддерживается."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not booking.resource:
            return Response(
                {"detail": "У брони не указан ресурс."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        if booking.end_datetime <= now:
            return Response(
                {
                    "booking_id": booking.id,
                    "has_options": False,
                    "reason": "booking_already_ended",
                },
                status=status.HTTP_200_OK,
            )

        # --- период, на который ищем замену ---
        def round_up_15(dt):
            dt = timezone.localtime(dt)
            minutes = dt.minute
            quarter = ((minutes + 14) // 15) * 15
            if quarter == 60:
                dt = dt.replace(minute=0, second=0, microsecond=0) + timezone.timedelta(
                    hours=1
                )
            else:
                dt = dt.replace(minute=quarter, second=0, microsecond=0)
            return timezone.make_aware(dt, timezone.get_current_timezone()) \
                if timezone.is_naive(dt) else dt

        period_start = max(round_up_15(now), booking.start_datetime)
        period_end = booking.end_datetime

        if period_start >= period_end:
            return Response(
                {
                    "booking_id": booking.id,
                    "has_options": False,
                    "reason": "no_period_left",
                },
                status=status.HTTP_200_OK,
            )

        old_resource = booking.resource
        resource_type = old_resource.type
        resource_category = resource_type.category

        # --- кандидаты ---
        if booking.booking_type == "workspace":
            candidate_qs = Resource.objects.filter(
                type__category=resource_category,
                status="active",
            )
            # если ресурс не общий зал (capacity ≤ 1) — исключаем сам ресурс
            base_cap = old_resource.capacity if old_resource.capacity is not None else 1
            if base_cap <= 1:
                candidate_qs = candidate_qs.exclude(id=old_resource.id)
        else:  # equipment
            candidate_qs = Resource.objects.filter(
                type=resource_type,
                status="active",
            ).exclude(id=old_resource.id)

        options = []

        for res in candidate_qs:
            # 1) базовая вместимость
            base_capacity = res.capacity if res.capacity is not None else 1

            # 2) суммарное уменьшение capacity за счёт outage
            outages = ResourceOutage.objects.filter(
                resource=res,
                start_datetime__lt=period_end,
                end_datetime__gt=period_start,
            )

            total_reduction = 0
            for o in outages:
                total_reduction += o.capacity_reduction or 0

            effective_capacity = base_capacity - total_reduction
            if effective_capacity <= 0:
                continue  # ресурс полностью выведен из работы

            # 3) пересекающиеся брони (active+conflicted)
            overlapping = Booking.objects.filter(
                resource=res,
                status__in=["active", "conflicted"],
                start_datetime__lt=period_end,
                end_datetime__gt=period_start,
            )

            # если смотрим на тот же ресурс, что в исходной брони —
            # свою бронь из пересечений исключаем
            if res.id == booking.resource_id:
                overlapping = overlapping.exclude(id=booking.id)

            if overlapping.count() >= effective_capacity:
                continue  # все "слоты" заняты

            options.append(
                {
                    "resource_id": res.id,
                    "resource_name": res.name or f"Ресурс #{res.id}",
                }
            )

        return Response(
            {
                "booking_id": booking.id,
                "booking_type": booking.booking_type,
                "period_start": timezone.localtime(period_start).isoformat(),
                "period_end": timezone.localtime(period_end).isoformat(),
                "has_options": len(options) > 0,
                "options": options,
            },
            status=status.HTTP_200_OK,
        )

    

    @action(
        detail=True,
        methods=["post"],
        url_path="apply-change",
        permission_classes=[IsAuthenticated],
    )
    def apply_change(self, request, pk=None):
        """
        Клиент согласен на изменение брони после поломки.

        Делим бронь на две части и переносим оставшийся период на другой ресурс.
        Для рабочих мест допускаются ресурсы внутри той же категории (workspace),
        для оборудования — только того же типа.

        Логика доступности ресурса согласована с change-options:
        - учитываем ResourceOutage.capacity_reduction;
        - считаем effective_capacity;
        - свою бронь из пересечений исключаем.
        """
        booking = self.get_object()
        user = request.user

        if not (user.is_staff or booking.user_id == user.id):
            return Response({"detail": "Недостаточно прав"}, status=403)

        if booking.status not in ["active", "conflicted"]:
            return Response(
                {
                    "detail": "Изменения можно применить только к активным или конфликтным броням."
                },
                status=400,
            )

        old_resource = booking.resource
        if old_resource is None:
            return Response({"detail": "У брони не указан ресурс."}, status=400)

        old_start = booking.start_datetime
        old_end = booking.end_datetime
        if not old_start or not old_end:
            return Response({"detail": "У брони не задан период."}, status=400)

        # --- 1. Момент поломки ---
        issue = (
            Issue.objects.filter(booking=booking)
            .order_by("-created_at")
            .first()
        )
        cut_dt = issue.created_at if issue else timezone.now()

        if cut_dt < old_start:
            cut_dt = old_start
        if cut_dt >= old_end:
            return Response(
                {
                    "detail": "Момент поломки находится за пределами периода бронирования."
                },
                status=400,
            )

        # ----- хелпер проверки ресурса на доступность -----
        def resource_free_for_remainder(res: Resource) -> (bool, str):
            """
            Проверка доступности ресурса res на интервал [cut_dt, old_end)
            с учётом outage'ов и effective_capacity, исключая текущую бронь.
            Возвращает (ok: bool, error_msg: str | None).
            """
            # 1) базовая capacity
            base_capacity = res.capacity if res.capacity is not None else 1

            # 2) суммарное уменьшение capacity по outage
            outages = ResourceOutage.objects.filter(
                resource=res,
                start_datetime__lt=old_end,
                end_datetime__gt=cut_dt,
            )

            total_reduction = 0
            for o in outages:
                total_reduction += o.capacity_reduction or 0

            effective_capacity = base_capacity - total_reduction
            if effective_capacity <= 0:
                return False, "Выбранный ресурс в этот период полностью выведен из работы."

            # 3) пересекающиеся брони, кроме текущей
            overlapping = Booking.objects.filter(
                resource=res,
                status__in=["active", "conflicted"],
                start_datetime__lt=old_end,
                end_datetime__gt=cut_dt,
            ).exclude(id=booking.id)

            if overlapping.count() >= effective_capacity:
                return False, "Выбранный ресурс уже полностью занят в этот период."

            return True, None

        selected_resource_id = (
            request.data.get("resource_id") or request.data.get("resourceId")
        )
        new_resource = None

        is_workspace = booking.booking_type == "workspace"

        # общие фильтры для кандидатов
        base_filter = {"status": "active"}
        if is_workspace:
            base_filter["type__category"] = old_resource.type.category
        else:
            base_filter["type"] = old_resource.type

        # --- 2.1. Явно выбранный ресурс ---
        if selected_resource_id:
            try:
                candidate = Resource.objects.get(
                    id=selected_resource_id,
                    **base_filter,
                )
            except Resource.DoesNotExist:
                return Response(
                    {
                        "detail": "Выбранный ресурс недоступен или имеет неподходящий тип."
                    },
                    status=400,
                )

            ok, err_msg = resource_free_for_remainder(candidate)
            if not ok:
                return Response({"detail": err_msg}, status=409)

            new_resource = candidate

        # --- 2.2. Автоподбор, если ресурс явно не выбран ---
        if new_resource is None:
            candidate_qs = Resource.objects.filter(**base_filter)

            # как и в change-options: если старый ресурс не общий (capacity ≤ 1),
            # исключаем его из кандидатов; общий зал оставляем.
            base_cap_old = (
                old_resource.capacity if old_resource.capacity is not None else 1
            )
            if base_cap_old <= 1:
                candidate_qs = candidate_qs.exclude(id=old_resource.id)

            for res in candidate_qs:
                ok, _ = resource_free_for_remainder(res)
                if ok:
                    new_resource = res
                    break

        if new_resource is None:
            return Response(
                {
                    "detail": (
                        "Не удалось найти доступный ресурс для оставшегося периода "
                        "бронирования."
                    )
                },
                status=409,
            )

        from .models import Booking as BookingModel

        with transaction.atomic():
            # 1) закрываем исходную бронь на момент поломки
            booking.end_datetime = cut_dt
            booking.status = "completed"
            booking.save(update_fields=["end_datetime", "status"])

            # 2) создаём новую бронь на оставшийся период
            new_booking = BookingModel.objects.create(
                user=booking.user,
                resource=new_resource,
                booking_type=booking.booking_type,
                time_format=booking.time_format,
                start_datetime=cut_dt,
                end_datetime=old_end,
                status="active",
            )

            # 3) переназначаем дочерние брони оборудования
            children_qs = BookingModel.objects.filter(
                parent_booking=booking,
                booking_type="equipment",
                status__in=["active", "conflicted"],
            )
            for child in children_qs:
                child.parent_booking = new_booking
                child.save(update_fields=["parent_booking"])


            # 4) уведомление пользователю
        create_notification(
        user=booking.user,
        event_type="booking_reassigned",
        title="Бронирование перенесено на другой ресурс",
        message=(
            f"В связи с недоступностью ресурса '{old_resource}' "
            f"ваше бронирование на период {old_start} — {old_end} "
            f"разделено: часть до {cut_dt} осталась на старом ресурсе, "
            f"а оставшееся время перенесено на ресурс '{new_resource}' "
            f"с {cut_dt} до {old_end}."
        ),
        booking=new_booking,
    )

        return Response(
            {
                "detail": "Бронирование разделено: оставшаяся часть перенесена на другой ресурс.",
                "old_booking_id": booking.id,
                "new_booking_id": new_booking.id,
                "new_resource_id": new_resource.id,
            },
            status=200,
        )


    

    # -------------------------------------------------------------------------
    # ДОБАВЛЕНИЕ ОБОРУДОВАНИЯ К УЖЕ СУЩЕСТВУЮЩЕЙ БРОНИ
    # -------------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="add-equipment")
    def add_equipment(self, request, pk=None):
        """
        Добавление оборудования к существующей брони рабочего места
        на ВЕСЬ период этой брони.

        Ожидает:
        {
          "resource_type_id": <int>,
          "quantity": <int>
        }
        """
        parent_booking = self.get_object()

        if parent_booking.status != "active":
            return Response(
                {"detail": "Оборудование можно добавлять только к активной брони."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if parent_booking.booking_type != "workspace":
            return Response(
                {"detail": "Оборудование можно добавлять только к брони рабочего места."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resource_type_id = request.data.get("resource_type_id")
        quantity = request.data.get("quantity")

        if not resource_type_id or quantity is None:
            return Response(
                {"detail": "Необходимо передать resource_type_id и quantity."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resource_type_id = int(resource_type_id)
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response(
                {"detail": "resource_type_id и quantity должны быть целыми числами."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if quantity <= 0:
            return Response(
                {"detail": "Количество должно быть больше нуля."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start = parent_booking.start_datetime
        end = parent_booking.end_datetime

        # пробуем подобрать оборудование через общий хелпер
        try:
            allocated = self._allocate_equipment_resources(
                start,
                end,
                [{"resource_type_id": resource_type_id, "quantity": quantity}],
            )
        except ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)

        allocated_resources = allocated[0]["resources"]

        created_bookings = []

        with transaction.atomic():
            for res in allocated_resources:
                child_booking = Booking.objects.create(
                    user=parent_booking.user,
                    resource=res,
                    booking_type="equipment",
                    time_format=parent_booking.time_format,
                    start_datetime=start,
                    end_datetime=end,
                    status="active",
                    parent_booking=parent_booking,
                    parent_relation_type="equipment",
                )
                created_bookings.append(child_booking)

        serializer = self.get_serializer(created_bookings, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # -------------------------------------------------------------------------
    # СОЗДАНИЕ, ДЕТАЛИ, ОТМЕНА
    # -------------------------------------------------------------------------

    def perform_create(self, serializer):
        booking = serializer.save(user=self.request.user)
        create_notification(
            user=self.request.user,
            event_type="booking_created",
            title="Бронирование создано",
            message=(
                f"Ваше бронирование ресурса '{booking.resource}' "
                f"с {format_dt(booking.start_datetime)} по {format_dt(booking.end_datetime)} успешно создано."
            ),
            booking=booking,
        )

    def _get_free_equipment_count(
        self, equipment_type: ResourceType, start_dt, end_dt
) -> int:
        """
        Возвращает количество свободных ресурсов данного типа
        на интервал [start_dt, end_dt) с учётом брони и ResourceOutage.
        """
        candidates = Resource.objects.filter(
            type=equipment_type,
            status="active",
        )

        if not candidates.exists():
            return 0

        # 1) занятые пересекающимися бронированиями
        busy_ids = set(
            Booking.objects.filter(
                resource__in=candidates,
                status__in=["active", "conflicted"],
                start_datetime__lt=end_dt,
                end_datetime__gt=start_dt,
            )
            .values_list("resource_id", flat=True)
            .distinct()
        )

        # 2) outage на этот интервал
        outages = ResourceOutage.objects.filter(
            resource__in=candidates,
            start_datetime__lt=end_dt,
            end_datetime__gt=start_dt,
        )

        reduction_by_resource: dict[int, int] = {}
        for o in outages:
            reduction_by_resource[o.resource_id] = (
                reduction_by_resource.get(o.resource_id, 0)
                + (o.capacity_reduction or 0)
            )

        for res in candidates:
            base_capacity = res.capacity if res.capacity is not None else 1
            total_reduction = reduction_by_resource.get(res.id, 0)
            effective_capacity = base_capacity - total_reduction
            if effective_capacity <= 0:
                busy_ids.add(res.id)

        free_count = candidates.exclude(id__in=busy_ids).count()
        return free_count

    

    @action(detail=True, methods=["post"], url_path="check-equipment-interval")
    def check_equipment_interval(self, request, pk=None):
        """
        Проверка, сколько свободного оборудования конкретного типа есть
        на интервале внутри брони рабочего места.

        Ожидает:
        {
          "resource_type_id": <id типа оборудования>,
          "start_datetime": "...",
          "end_datetime": "..."
        }
        """
        parent_booking = self.get_object()

        if parent_booking.booking_type != "workspace":
            return Response(
                {"detail": "Проверка доступности оборудования возможна только для брони рабочего места."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resource_type_id = request.data.get("resource_type_id")
        start_str = request.data.get("start_datetime")
        end_str = request.data.get("end_datetime")

        if not resource_type_id or not start_str or not end_str:
            return Response(
                {
                    "detail": "Нужно передать resource_type_id, start_datetime и end_datetime."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str)

        if start_dt is None or end_dt is None:
            return Response(
                {
                    "detail": "Неверный формат start_datetime / end_datetime. "
                              "Используйте ISO 8601, например 2025-11-25T12:00:00."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

        if end_dt <= start_dt:
            return Response(
                {"detail": "Время окончания должно быть позже времени начала."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # интервал должен лежать внутри брони
        if not (parent_booking.start_datetime <= start_dt and end_dt <= parent_booking.end_datetime):
            return Response(
                {
                    "detail": "Интервал должен находиться внутри интервала брони рабочего места."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # рабочие часы
        try:
            check_working_hours(start_dt, end_dt)
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            equipment_type = ResourceType.objects.get(id=resource_type_id)
        except ResourceType.DoesNotExist:
            return Response(
                {"detail": "Тип оборудования с указанным ID не найден."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        available_count = self._get_free_equipment_count(equipment_type, start_dt, end_dt)

        return Response(
            {
                "available_count": available_count
            },
            status=status.HTTP_200_OK,
        )

    
    @action(detail=False, methods=["post"], url_path="check-equipment-availability")
    def check_equipment_availability(self, request):
        """
        Проверка доступности оборудования до создания брони.
        Ожидает:
        {
        "start_datetime": "...",
        "end_datetime": "...",
        "equipment": [
            {"resource_type_id": X, "quantity": N},
            ...
        ]
        }
        """
        start_str = request.data.get("start_datetime")
        end_str = request.data.get("end_datetime")
        items = request.data.get("equipment", [])

        if not start_str or not end_str or not isinstance(items, list):
            return Response(
                {"detail": "start_datetime, end_datetime и список equipment обязательны."},
                status=status.HTTP_400_BAD_REQUEST
            )

        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str)

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

        # пробуем подобрать оборудование через общий хелпер
        try:
            self._allocate_equipment_resources(start_dt, end_dt, items)
            return Response({"ok": True}, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
    

    @action(detail=True, methods=["post"], url_path="add-equipment-interval-bulk")
    def add_equipment_interval_bulk(self, request, pk=None):
        """
        Добавление нескольких видов оборудования за один раз на один интервал.

        Ожидает:
        {
          "start_datetime": "...",
          "end_datetime": "...",
          "items": [
            {"resource_type_id": 3, "quantity": 2},
            {"resource_type_id": 5, "quantity": 1}
          ]
        }

        Если хоть по одному типу оборудования не хватает устройств,
        НИ ОДНА бронь не создаётся, возвращаем 400 с деталями.
        """
        parent_booking = self.get_object()

        if parent_booking.status != "active":
            return Response(
                {"detail": "Оборудование можно добавлять только к активной брони."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if parent_booking.booking_type != "workspace":
            return Response(
                {"detail": "Оборудование можно добавлять только к брони рабочего места."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_str = request.data.get("start_datetime")
        end_str = request.data.get("end_datetime")
        items = request.data.get("items")

        if not start_str or not end_str or not isinstance(items, list) or not items:
            return Response(
                {
                    "detail": "Необходимо передать start_datetime, end_datetime и непустой список items."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str)

        if start_dt is None or end_dt is None:
            return Response(
                {
                    "detail": "Неверный формат start_datetime / end_datetime. "
                              "Используйте ISO 8601, например 2025-11-25T12:00:00."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

        if end_dt <= start_dt:
            return Response(
                {"detail": "Время окончания должно быть позже времени начала."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # интервал внутри родительской брони
        if not (parent_booking.start_datetime <= start_dt and end_dt <= parent_booking.end_datetime):
            return Response(
                {
                    "detail": "Интервал оборудования должен находиться внутри интервала "
                              "родительской брони рабочего места."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # рабочие часы
        try:
            check_working_hours(start_dt, end_dt)
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # собираем ResourceType и проверяем уникальность
        type_map = {}
        errors = []

        for idx, item in enumerate(items):
            resource_type_id = item.get("resource_type_id")
            quantity = item.get("quantity")

            if not resource_type_id or quantity is None:
                errors.append(
                    {"index": idx, "detail": "resource_type_id и quantity обязательны для каждого элемента."}
                )
                continue

            try:
                quantity = int(quantity)
            except (TypeError, ValueError):
                errors.append(
                    {"index": idx, "detail": "quantity должен быть целым числом."}
                )
                continue

            if quantity <= 0:
                errors.append(
                    {"index": idx, "detail": "quantity должен быть больше нуля."}
                )
                continue

            if resource_type_id in type_map:
                errors.append(
                    {
                        "index": idx,
                        "detail": f"Тип оборудования {resource_type_id} указан более одного раза. "
                                  f"Объедините количество в один элемент."
                        }
                )
                continue

            try:
                equipment_type = ResourceType.objects.get(id=resource_type_id)
            except ResourceType.DoesNotExist:
                errors.append(
                    {"index": idx, "detail": f"Тип оборудования с id={resource_type_id} не найден."}
                )
                continue

            type_map[resource_type_id] = {
                "type": equipment_type,
                "quantity": quantity,
            }

        if errors:
            return Response(
                {"detail": "Ошибки в списке items.", "items_errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # сначала проверяем доступность по всем типам
        shortage = []

        for resource_type_id, info in type_map.items():
            equipment_type = info["type"]
            qty_needed = info["quantity"]

            available_count = self._get_free_equipment_count(
                equipment_type, start_dt, end_dt
            )

            info["available_count"] = available_count

            if available_count < qty_needed:
                shortage.append(
                    {
                        "resource_type_id": resource_type_id,
                        "needed": qty_needed,
                        "available": available_count,
                    }
                )

        if shortage:
            return Response(
                {
                    "detail": "Недостаточно оборудования по некоторым типам. "
                              "Бронирование не создано.",
                    "shortage": shortage,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # если всего хватает — создаём брони на оборудование
        created_bookings = []

        for resource_type_id, info in type_map.items():
            equipment_type = info["type"]
            qty_needed = info["quantity"]

            candidates = Resource.objects.filter(
                type=equipment_type,
                status="active",
            )

            # 1) пересекающиеся брони
            busy_ids = set(
                Booking.objects.filter(
                    resource__in=candidates,
                    status__in=["active", "conflicted"],
                    start_datetime__lt=end_dt,
                    end_datetime__gt=start_dt,
                )
                .values_list("resource_id", flat=True)
                .distinct()
            )

            # 2) outage
            outages = ResourceOutage.objects.filter(
                resource__in=candidates,
                start_datetime__lt=end_dt,
                end_datetime__gt=start_dt,
            )

            reduction_by_resource: dict[int, int] = {}
            for o in outages:
                reduction_by_resource[o.resource_id] = (
                    reduction_by_resource.get(o.resource_id, 0)
                    + (o.capacity_reduction or 0)
                )

            fully_unavailable_ids = set()
            for res in candidates:
                base_capacity = res.capacity if res.capacity is not None else 1
                total_reduction = reduction_by_resource.get(res.id, 0)
                effective_capacity = base_capacity - total_reduction
                if effective_capacity <= 0:
                    fully_unavailable_ids.add(res.id)

            busy_ids.update(fully_unavailable_ids)

            free_resources = list(
                candidates.exclude(id__in=busy_ids)[:qty_needed]
            )

            for res in free_resources:
                child_booking = Booking.objects.create(
                    user=parent_booking.user,
                    resource=res,
                    booking_type="equipment",
                    time_format="hour",
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    status="active",
                    parent_booking=parent_booking,
                    parent_relation_type="equipment",
                )
                created_bookings.append(child_booking)

        serializer = self.get_serializer(created_bookings, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


    @action(detail=True, methods=["get"], url_path="details")
    def details(self, request, pk=None):
        booking = self.get_object()
        serializer = BookingDetailSerializer(booking)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        booking = self.get_object()
        user = request.user

        # кто может отменять
        if not (user.is_staff or booking.user == user):
            return Response(
                {"detail": "Вы не можете отменить это бронирование."},
                status=403,
            )

        # что можно отменять
        if booking.status not in ["active", "conflicted"]:
            return Response(
                {
                    "detail": "Можно отменить только активное или конфликтное бронирование."
                },
                status=400,
            )

        # если это бронь рабочего места — найдём дочерние брони оборудования
        if booking.booking_type == "workspace":
            child_equipments = Booking.objects.filter(
                parent_booking=booking,
                booking_type="equipment",
                status__in=["active", "conflicted"],
            )
        else:
            # для брони оборудования (или других типов) ничего каскадно не трогаем
            child_equipments = Booking.objects.none()

        with transaction.atomic():
            # 1) отменяем основную бронь
            booking.status = "cancelled"
            booking.save(update_fields=["status"])

            message_main = (
                f"Ваше бронирование ресурса '{booking.resource}' "
                f"на период {booking.start_datetime} — {booking.end_datetime} "
                f"было отменено."
            )

            create_notification(
                user=booking.user,
                event_type="booking_cancelled",
                title="Бронирование отменено",
                message=message_main,
                channel="system",
                booking=booking,
            )

            # 2) если есть дочерние брони оборудования — отменяем и их
            for child in child_equipments:
                child.status = "cancelled"
                child.save(update_fields=["status"])

                message_child = (
                    f"Бронирование оборудования '{child.resource}' "
                    f"на период {child.start_datetime} — {child.end_datetime} "
                    f"отменено в связи с отменой основной брони рабочего места."
                )

                create_notification(
                    user=child.user,
                    event_type="booking_cancelled",  # ВАЖНО: event_type, не notification_type
                    title="Бронирование оборудования отменено",
                    message=message_child,
                    channel="system",
                    booking=child,
                )

        return Response({"detail": "Бронирование отменено."})

    
    @action(detail=True, methods=["post"], url_path="add-equipment-interval")
    def add_equipment_interval(self, request, pk=None):
        """
        Добавление оборудования к существующей брони рабочего места
        на ОТДЕЛЬНЫЙ интервал времени внутри этой брони.

        Ожидает:
        {
          "resource_type_id": <id типа оборудования>,
          "quantity": <кол-во>,
          "start_datetime": "2025-11-25T12:00:00",
          "end_datetime":   "2025-11-25T13:00:00"
        }
        """
        parent_booking = self.get_object()

        # только к активной брони рабочего места
        if parent_booking.status != "active":
            return Response(
                {"detail": "Оборудование можно добавлять только к активной брони."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if parent_booking.booking_type != "workspace":
            return Response(
                {"detail": "Оборудование можно добавлять только к брони рабочего места."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resource_type_id = request.data.get("resource_type_id")
        quantity = request.data.get("quantity")
        start_str = request.data.get("start_datetime")
        end_str = request.data.get("end_datetime")

        if not resource_type_id or quantity is None or not start_str or not end_str:
            return Response(
                {
                    "detail": "Нужно передать resource_type_id, quantity, "
                              "start_datetime и end_datetime."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # количество
        try:
            quantity = int(quantity)
        except ValueError:
            return Response(
                {"detail": "Поле quantity должно быть целым числом."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if quantity <= 0:
            return Response(
                {"detail": "Количество должно быть больше нуля."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # парсим время
        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str)

        if start_dt is None or end_dt is None:
            return Response(
                {
                    "detail": "Неверный формат start_datetime / end_datetime. "
                              "Используйте ISO 8601, например 2025-11-25T12:00:00."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())

        if end_dt <= start_dt:
            return Response(
                {"detail": "Время окончания должно быть позже времени начала."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # интервал ДОЛЖЕН находиться внутри интервала родительской брони
        if not (parent_booking.start_datetime <= start_dt and end_dt <= parent_booking.end_datetime):
            return Response(
                {
                    "detail": "Интервал оборудования должен находиться внутри интервала "
                              "родительской брони рабочего места."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # правило рабочих часов
        try:
            check_working_hours(start_dt, end_dt)
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # тип оборудования
        try:
            equipment_type = ResourceType.objects.get(id=resource_type_id)
        except ResourceType.DoesNotExist:
            return Response(
                {"detail": "Тип оборудования с указанным ID не найден."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # кандидаты-ресурсы этого типа
        candidates = Resource.objects.filter(
            type=equipment_type,
            status="active",
        )

        if not candidates.exists():
            return Response(
                {"detail": "Нет доступного оборудования данного типа."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # уже занятые ресурсы в этот интервал
        busy_resource_ids = (
            Booking.objects.filter(
                resource__in=candidates,
                status__in=["active", "conflicted"],
                start_datetime__lt=end_dt,
                end_datetime__gt=start_dt,
            )
            .values_list("resource_id", flat=True)
            .distinct()
        )

        free_resources = candidates.exclude(id__in=busy_resource_ids)

        if free_resources.count() < quantity:
            return Response(
                {
                    "detail": (
                        f"Недостаточно свободного оборудования на указанный интервал. "
                        f"Запрошено: {quantity}, доступно: {free_resources.count()}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        free_resources = list(free_resources[:quantity])

        created_bookings = []

        for res in free_resources:
            child_booking = Booking.objects.create(
                user=parent_booking.user,
                resource=res,
                booking_type="equipment",
                time_format="hour", 
                start_datetime=start_dt,
                end_datetime=end_dt,
                status="active",
                parent_booking=parent_booking,
                parent_relation_type="equipment",
            )
            created_bookings.append(child_booking)

        serializer = self.get_serializer(created_bookings, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
