from datetime import timedelta

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.decorators import action
from rest_framework.response import Response

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Issue, ResourceOutage
from .serializers import IssueSerializer, ResourceOutageSerializer
from bookings.models import Booking
from notifications.utils import create_notification, format_dt
from resources.models import Resource


def handle_resource_breakdown(resource, start_dt, end_dt, issue=None):
    """
    Старый черновой хелпер оставлен на всякий случай.
    Сейчас не используется, но пусть лежит.
    """
    conflicted_bookings = Booking.objects.filter(
        resource=resource,
        status="active",
        start_datetime__lt=end_dt,
        end_datetime__gt=start_dt,
    )
    updated_count = conflicted_bookings.update(status="conflicted")
    return {
        "total_conflicted": updated_count,
    }


def resource_available_for_period(
    resource,
    start_dt,
    end_dt,
    exclude_booking_id=None,
):
    """
    Свободен ли ресурс на весь интервал [start_dt, end_dt)
    с учётом:
    - ResourceOutage (сломан/выведен);
    - пересекающихся броней и capacity.
    """
    # 1) outages
    has_outage = ResourceOutage.objects.filter(
        resource=resource,
        start_datetime__lt=end_dt,
        end_datetime__gt=start_dt,
    ).exists()
    if has_outage:
        return False

    # 2) пересекающиеся брони на этом ресурсе
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


class IssueViewSet(viewsets.ModelViewSet):
    queryset = (
        Issue.objects.select_related("user", "booking", "resource")
        .all()
        .order_by("-created_at")
    )
    serializer_class = IssueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # клиент видит только свои обращения
        if not user.is_staff:
            qs = qs.filter(user=user)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        # фильтр по конкретной брони
        booking_param = self.request.query_params.get("booking")
        if booking_param:
            qs = qs.filter(booking_id=booking_param)

        return qs

    def perform_create(self, serializer):
        booking = serializer.validated_data.get("booking")
        resource = serializer.validated_data.get("resource")

        # если есть booking, но нет resource — берём ресурс из брони
        if booking and resource is None:
            resource = booking.resource

        issue = serializer.save(
            user=self.request.user,
            booking=booking,
            resource=resource,
            status="new",
        )

        create_notification(
            user=issue.user,
            event_type="issue_created",
            title="Создано обращение о проблеме",
            message=(
                f"Ваше обращение о проблеме по ресурсу '{issue.resource}' "
                f"успешно зарегистрировано и будет рассмотрено администратором."
            ),
            issue=issue,
            booking=issue.booking,
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAdminUser],
        url_path="confirm",
    )
    def confirm_issue(self, request, pk=None):
        """
        Администратор подтверждает поломку.

        Логика:

        1) Создаём ResourceOutage на выбранные ресурсы:
           - ресурс может быть как рабочим местом, так и оборудованием;
           - capacity_reduction = capacity ресурса (полный вывод из работы).

        2) «Текущие» брони не трогаем автопереносом:
           - если ресурс — рабочее место:
                текущая issue.booking по этому ресурсу (пересечение с [start, end])
                помечается как conflicted (без переноса);
           - если ресурс — оборудование:
                ищем equipment-брони с resource=res и parent_booking=issue.booking
                (пересечение с [start, end]) → помечаем conflicted.

        3) Все прочие БУДУЩИЕ брони на сломанных ресурсах:
           - пытаемся перенести на другой ресурс того же типа;
           - если не получилось → ставим conflicted.

        В ответе отдаём:
        - количество перенесённых / помеченных конфликтными;
        - списки конкретных броней: auto_reassigned_bookings, conflicted_bookings.
        """

        issue = self.get_object()

        if issue.status != "new":
            return Response(
                {"detail": "Подтвердить можно только новую заявку."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_str = request.data.get("start_datetime")
        end_str = request.data.get("end_datetime")
        resource_ids = request.data.get("resource_ids")

        if not start_str or not end_str:
            return Response(
                {"detail": "Необходимо передать start_datetime и end_datetime."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_dt = parse_datetime(start_str)
        end_dt = parse_datetime(end_str)

        if not start_dt or not end_dt:
            return Response(
                {"detail": "Неверный формат дат. Используйте ISO 8601."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(
                start_dt, timezone.get_current_timezone()
            )
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(
                end_dt, timezone.get_current_timezone()
            )

        if end_dt <= start_dt:
            return Response(
                {"detail": "Время окончания должно быть позже начала."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- ресурсы, которые выводим из работы ---
        if resource_ids:
            if isinstance(resource_ids, str):
                try:
                    resource_ids = [int(resource_ids)]
                except Exception:
                    return Response(
                        {"detail": "Некорректный resource_ids"}, status=400
                    )

            try:
                resources_qs = Resource.objects.filter(id__in=resource_ids)
            except Exception:
                return Response(
                    {"detail": "Некорректный формат resource_ids"}, status=400
                )

            if not resources_qs.exists():
                return Response({"detail": "Ресурсы не найдены"}, status=400)
        else:
            if not issue.resource:
                return Response(
                    {
                        "detail": "У заявки нет ресурса и не переданы resource_ids"
                    },
                    status=400,
                )
            resources_qs = Resource.objects.filter(id=issue.resource.id)

        created_outages = []

        total_reassigned = 0
        total_conflicted = 0

        auto_reassigned_bookings = []
        conflicted_bookings = []

        future_from = max(timezone.now(), start_dt)
        parent_booking = issue.booking  # бронь рабочего места из issue (может быть None)

        # id броней, которые НЕ нужно автопереносить
        excluded_booking_ids_for_auto = set()

        # --- основной цикл по ресурсам ---
        for res in resources_qs:
            # определяем, является ли ресурс оборудованием (по категории)
            category = getattr(res.type, "category", None)
            cat_code = (getattr(category, "code", "") or "").lower()
            cat_name = (getattr(category, "name", "") or "").lower()

            is_equipment_resource = False
            if (
                "equip" in cat_code
                or "equipment" in cat_name
                or "оборуд" in cat_name
                or cat_code == "equipment"
            ):
                is_equipment_resource = True

            # 1) создаём outage: полностью выводим ресурс из работы
            outage = ResourceOutage.objects.create(
                resource=res,
                start_datetime=start_dt,
                end_datetime=end_dt,
                reason="issue",
                issue=issue,
                capacity_reduction=res.capacity or 1,
            )
            created_outages.append(outage)

            # 2) «текущие» брони по этому ресурсу — НЕ переносим, только помечаем conflicted
            if parent_booking:
                # 2.1. если ресурс — рабочее место
                if not is_equipment_resource:
                    if (
                        parent_booking.resource_id == res.id
                        and parent_booking.status in ["active", "conflicted"]
                        and parent_booking.start_datetime < end_dt
                        and parent_booking.end_datetime > start_dt
                    ):
                        if parent_booking.status != "conflicted":
                            parent_booking.status = "conflicted"
                            parent_booking.save(update_fields=["status"])
                            total_conflicted += 1

                            # уведомляем клиента о конфликте текущей брони
                            create_notification(
                                user=parent_booking.user,
                                event_type="booking_conflicted",
                                title="Бронирование требует выбора нового места",
                                message=(
                                    f"Бронирование рабочего места по ресурсу "
                                    f"'{parent_booking.resource}' на период "
                                    f"{format_dt(parent_booking.start_datetime)} — "
                                    f"{format_dt(parent_booking.end_datetime)} "
                                    f"помечено как конфликтное из-за неисправности ресурса."
                                ),
                                booking=parent_booking,
                                issue=issue,
                            )

                        conflicted_bookings.append(
                            {
                                "id": parent_booking.id,
                                "resource_id": res.id,
                                "resource_name": res.name
                                or f"Ресурс #{res.id}",
                                "start_datetime": parent_booking.start_datetime,
                                "end_datetime": parent_booking.end_datetime,
                                "reason": "current_booking",
                            }
                        )
                        excluded_booking_ids_for_auto.add(parent_booking.id)

                # 2.2. если ресурс — оборудование
                else:
                    current_equipment_bookings = Booking.objects.filter(
                        resource=res,
                        parent_booking_id=parent_booking.id,
                        status__in=["active", "conflicted"],
                        start_datetime__lt=end_dt,
                        end_datetime__gt=start_dt,
                    )
                    for b in current_equipment_bookings:
                        if b.status != "conflicted":
                            b.status = "conflicted"
                            b.save(update_fields=["status"])
                            total_conflicted += 1

                            # уведомление по оборудованию
                            create_notification(
                                user=b.user,
                                event_type="booking_conflicted",
                                title="Бронирование оборудования требует выбора замены",
                                message=(
                                    f"Бронирование оборудования '{b.resource}' "
                                    f"на период {format_dt(b.start_datetime)} — "
                                    f"{format_dt(b.end_datetime)} "
                                    f"помечено как конфликтное из-за неисправности оборудования."
                                ),
                                booking=b,
                                issue=issue,
                            )

                        conflicted_bookings.append(
                            {
                                "id": b.id,
                                "resource_id": res.id,
                                "resource_name": res.name
                                or f"Ресурс #{res.id}",
                                "start_datetime": b.start_datetime,
                                "end_datetime": b.end_datetime,
                                "reason": "current_equipment",
                            }
                        )
                        excluded_booking_ids_for_auto.add(b.id)

            # 3) авто-перенос будущих броней на этом ресурсе
            same_type_candidates = Resource.objects.filter(
                type=res.type,
                status="active",
            ).exclude(id=res.id)

            affected_qs = Booking.objects.filter(
                resource=res,
                status__in=["active", "conflicted"],
                start_datetime__lt=end_dt,
                end_datetime__gt=start_dt,
                start_datetime__gte=future_from,
            )

            if excluded_booking_ids_for_auto:
                affected_qs = affected_qs.exclude(
                    id__in=excluded_booking_ids_for_auto
                )

            for booking in affected_qs.order_by("start_datetime"):
                new_resource = None

                # ищем свободный ресурс того же типа
                for candidate in same_type_candidates:
                    if resource_available_for_period(
                        candidate,
                        booking.start_datetime,
                        booking.end_datetime,
                        exclude_booking_id=booking.id,
                    ):
                        new_resource = candidate
                        break

                if new_resource:
                    old_resource = booking.resource
                    booking.resource = new_resource
                    if booking.status != "active":
                        booking.status = "active"
                    booking.save(update_fields=["resource", "status"])
                    total_reassigned += 1

                    # уведомление о переносе
                    create_notification(
                        user=booking.user,
                        event_type="booking_reassigned",
                        title="Бронирование перенесено на другой ресурс",
                        message=(
                            f"Ваше бронирование ресурса '{old_resource}' на период "
                            f"{format_dt(booking.start_datetime)} — "
                            f"{format_dt(booking.end_datetime)} "
                            f"перенесено на ресурс '{new_resource}' "
                            f"в связи с неисправностью исходного ресурса."
                        ),
                        booking=booking,
                        issue=issue,
                    )

                    auto_reassigned_bookings.append(
                        {
                            "id": booking.id,
                            "old_resource_id": old_resource.id,
                            "old_resource_name": old_resource.name
                            or f"Ресурс #{old_resource.id}",
                            "new_resource_id": new_resource.id,
                            "new_resource_name": new_resource.name
                            or f"Ресурс #{new_resource.id}",
                            "start_datetime": booking.start_datetime,
                            "end_datetime": booking.end_datetime,
                        }
                    )
                else:
                    if booking.status != "conflicted":
                        booking.status = "conflicted"
                        booking.save(update_fields=["status"])
                        total_conflicted += 1

                        # уведомление о конфликте будущей брони
                        create_notification(
                            user=booking.user,
                            event_type="booking_conflicted",
                            title="Бронирование требует выбора нового ресурса",
                            message=(
                                f"Ваше бронирование ресурса '{booking.resource}' "
                                f"на период {format_dt(booking.start_datetime)} — "
                                f"{format_dt(booking.end_datetime)} "
                                f"стало конфликтным: нет свободных ресурсов этого типа "
                                f"на указанный интервал. Пожалуйста, выберите другой вариант."
                            ),
                            booking=booking,
                            issue=issue,
                        )

                    conflicted_bookings.append(
                        {
                            "id": booking.id,
                            "resource_id": res.id,
                            "resource_name": res.name
                            or f"Ресурс #{res.id}",
                            "start_datetime": booking.start_datetime,
                            "end_datetime": booking.end_datetime,
                            "reason": "no_free_same_type",
                        }
                    )

        # статус заявки
        issue.status = "confirmed"
        issue.save(update_fields=["status", "updated_at"])

        create_notification(
            user=issue.user,
            event_type="issue_confirmed",
            title="Обращение подтверждено",
            message=(
                "Администратор подтвердил неисправность ресурса. "
                f"Автоматически перенесено броней: {total_reassigned}. "
                f"Броней, требующих ручного выбора нового места/оборудования: {total_conflicted}."
            ),
            issue=issue,
            booking=issue.booking,
        )

        return Response(
            {
                "detail": (
                    "Заявка подтверждена. Ресурсы выведены из работы, "
                    "будущие брони перераспределены."
                ),
                "auto_reassigned_count": total_reassigned,
                "conflicted_count": total_conflicted,
                "auto_reassigned_bookings": auto_reassigned_bookings,
                "conflicted_bookings": conflicted_bookings,
                "outages": ResourceOutageSerializer(
                    created_outages, many=True
                ).data,
            },
            status=200,
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAdminUser],
        url_path="reject",
    )
    def reject_issue(self, request, pk=None):
        """
        Администратор отклоняет заявку о проблеме.
        """
        issue = self.get_object()

        if issue.status != "new":
            return Response(
                {"detail": "Отклонить можно только новую заявку."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue.status = "rejected"
        issue.save(update_fields=["status", "updated_at"])

        create_notification(
            user=issue.user,
            event_type="issue_rejected",
            title="Обращение отклонено",
            message=(
                f"Ваше обращение по ресурсу '{issue.resource}' "
                f"было отклонено администратором."
            ),
            issue=issue,
            booking=issue.booking,
        )

        return Response(
            {"detail": "Заявка отклонена."},
            status=status.HTTP_200_OK,
        )


class ResourceOutageViewSet(viewsets.ModelViewSet):
    queryset = (
        ResourceOutage.objects.select_related("resource")
        .all()
        .order_by("-start_datetime")
    )
    serializer_class = ResourceOutageSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        resource_id = self.request.query_params.get("resource")
        if resource_id:
            qs = qs.filter(resource_id=resource_id)

        current_only = self.request.query_params.get("current")
        if current_only in ["1", "true", "True", "yes"]:
            now = timezone.now()
            qs = qs.filter(start_datetime__lt=now, end_datetime__gt=now)

        return qs

    @action(detail=False, methods=["post"], url_path="with-redistribution")
    def create_with_redistribution(self, request):
        """
        Создать outage по ресурсу и перераспределить брони
        (логика аналогична confirm_issue, но без привязки к Issue).

        Параметры:
        - resource_id (обязателен)
        - либо:
            - start_datetime, end_datetime (ISO 8601)
          либо:
            - mode="all_future"  → выводим ресурс из работы на всё будущее
              (используем очень далёкую end_datetime).

        Возвращает:
        - outage
        - auto_reassigned_* / conflicted_* так же, как confirm_issue.
        """
        resource_id = request.data.get("resource_id")
        mode = request.data.get("mode")

        if not resource_id:
            return Response(
                {"detail": "Нужно передать resource_id"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resource = Resource.objects.get(id=resource_id)
        except Resource.DoesNotExist:
            return Response(
                {"detail": "Ресурс не найден"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # определяем интервал
        if mode == "all_future":
            start_dt = timezone.now()
            end_dt = start_dt + timedelta(days=365 * 5)
            reason = "broken"
        else:
            start_str = request.data.get("start_datetime")
            end_str = request.data.get("end_datetime")

            if not start_str or not end_str:
                return Response(
                    {
                        "detail": "Нужно передать start_datetime и end_datetime "
                        "или указать mode='all_future'."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            start_dt = parse_datetime(start_str)
            end_dt = parse_datetime(end_str)

            if not start_dt or not end_dt:
                return Response(
                    {"detail": "Неверный формат дат. Используйте ISO 8601."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if timezone.is_naive(start_dt):
                start_dt = timezone.make_aware(
                    start_dt, timezone.get_current_timezone()
                )
            if timezone.is_naive(end_dt):
                end_dt = timezone.make_aware(
                    end_dt, timezone.get_current_timezone()
                )

            if end_dt <= start_dt:
                return Response(
                    {
                        "detail": "Время окончания должно быть позже начала."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            reason = "maintenance"

        # создаём outage
        outage = ResourceOutage.objects.create(
            resource=resource,
            start_datetime=start_dt,
            end_datetime=end_dt,
            reason=reason,
            issue=None,
            capacity_reduction=resource.capacity or 1,
        )

        created_outages = [outage]

        total_reassigned = 0
        total_conflicted = 0
        auto_reassigned_bookings = []
        conflicted_bookings = []

        future_from = max(timezone.now(), start_dt)

        # такой же подбор кандидатов, как в confirm_issue
        same_type_candidates = Resource.objects.filter(
            type=resource.type,
            status="active",
        ).exclude(id=resource.id)

        affected_qs = Booking.objects.filter(
            resource=resource,
            status__in=["active", "conflicted"],
            start_datetime__lt=end_dt,
            end_datetime__gt=start_dt,
            start_datetime__gte=future_from,
        )

        for booking in affected_qs.order_by("start_datetime"):
            new_resource = None

            for candidate in same_type_candidates:
                if resource_available_for_period(
                    candidate,
                    booking.start_datetime,
                    booking.end_datetime,
                    exclude_booking_id=booking.id,
                ):
                    new_resource = candidate
                    break

            if new_resource:
                old_resource = booking.resource
                booking.resource = new_resource
                if booking.status != "active":
                    booking.status = "active"
                booking.save(update_fields=["resource", "status"])
                total_reassigned += 1

                # уведомление о переносе по решению админа
                create_notification(
                    user=booking.user,
                    event_type="booking_reassigned",
                    title="Бронирование перенесено на другой ресурс",
                    message=(
                        f"Ваше бронирование ресурса '{old_resource}' "
                        f"на период {format_dt(booking.start_datetime)} — "
                        f"{format_dt(booking.end_datetime)} "
                        f"перенесено на ресурс '{new_resource}' "
                        f"в связи с выводом исходного ресурса из работы."
                    ),
                    booking=booking,
                )

                auto_reassigned_bookings.append(
                    {
                        "id": booking.id,
                        "old_resource_id": old_resource.id,
                        "old_resource_name": old_resource.name
                        or f"Ресурс #{old_resource.id}",
                        "new_resource_id": new_resource.id,
                        "new_resource_name": new_resource.name
                        or f"Ресурс #{new_resource.id}",
                        "start_datetime": booking.start_datetime,
                        "end_datetime": booking.end_datetime,
                    }
                )
            else:
                if booking.status != "conflicted":
                    booking.status = "conflicted"
                    booking.save(update_fields=["status"])
                    total_conflicted += 1

                    # уведомление о конфликте по решению админа
                    create_notification(
                        user=booking.user,
                        event_type="booking_conflicted",
                        title="Бронирование требует выбора нового ресурса",
                        message=(
                            f"Ваше бронирование ресурса '{booking.resource}' "
                            f"на период {format_dt(booking.start_datetime)} — "
                            f"{format_dt(booking.end_datetime)} "
                            f"стало конфликтным в связи с выводом ресурса из работы "
                            f"и отсутствием свободных ресурсов того же типа."
                        ),
                        booking=booking,
                    )

                conflicted_bookings.append(
                    {
                        "id": booking.id,
                        "resource_id": resource.id,
                        "resource_name": resource.name
                        or f"Ресурс #{resource.id}",
                        "start_datetime": booking.start_datetime,
                        "end_datetime": booking.end_datetime,
                        "reason": "no_free_same_type",
                    }
                )

        return Response(
            {
                "detail": (
                    "Ресурс выведен из работы, будущие брони перераспределены."
                ),
                "auto_reassigned_count": total_reassigned,
                "conflicted_count": total_conflicted,
                "auto_reassigned_bookings": auto_reassigned_bookings,
                "conflicted_bookings": conflicted_bookings,
                "outages": ResourceOutageSerializer(
                    created_outages, many=True
                ).data,
            },
            status=status.HTTP_200_OK,
        )
