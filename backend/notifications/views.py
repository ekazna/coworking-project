from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, IsAdminUser

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    - Пользователь видит только свои уведомления.
    - Администратор видит все.
    """
    queryset = Notification.objects.select_related("user", "booking", "issue", "service_order").all().order_by(
        "-created_at"
    )
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if not user.is_staff:
            qs = qs.filter(user=user)

        return qs
