from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "event_type",
            "channel",
            "title",
            "message",
            "status",
            "booking",
            "issue",
            "service_order",
            "created_at",
            "sent_at",
        ]
        read_only_fields = fields
