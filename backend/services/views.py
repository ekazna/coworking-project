from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

from .models import Service, ServiceOrder
from .serializers import ServiceSerializer, ServiceOrderSerializer
from notifications.utils import create_notification


class ServiceViewSet(viewsets.ModelViewSet):
    """
    Справочник услуг.
    - Клиенты могут только смотреть список и детали.
    - Администратор может создавать/редактировать/удалять.
    """
    queryset = Service.objects.all().order_by("name")
    serializer_class = ServiceSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated()]
        return [IsAdminUser()]


class ServiceOrderViewSet(viewsets.ModelViewSet):
    """
    Заказы услуг, привязанные к конкретным бронированиям.
    """
    queryset = (
        ServiceOrder.objects
        .select_related("booking", "booking__user", "service")
        .all()
        .order_by("-created_at")
    )
    serializer_class = ServiceOrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # клиент видит только заказы по своим бронированиям
        if not user.is_staff:
            qs = qs.filter(booking__user=user)

        return qs

    def create(self, request, *args, **kwargs):
        """
        При создании проверяем, что пользователь не пытается заказать
        услугу для чужой брони.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        booking = serializer.validated_data["booking"]
        user = request.user

        if not user.is_staff and booking.user != user:
            return Response(
                {"detail": "Нельзя заказывать услуги для чужой брони."},
                status=status.HTTP_403_FORBIDDEN,
            )

        self.perform_create(serializer)

        service_order = serializer.instance

        create_notification(
            user=service_order.booking.user,
            event_type="service_order_created",
            title="Создан заказ услуги",
            message=(
                f"Для вашей брони #{service_order.booking.id} создан заказ услуги "
                f"'{service_order.service.name}' в количестве {service_order.quantity} "
                f"на сумму {service_order.total_price}."
            ),
            service_order=service_order,
            booking=service_order.booking,
        )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
