from rest_framework import serializers
from django.contrib.auth.models import User

from .models import UserProfile, UserNotificationSettings


class UserAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "date_joined",
        ]
        read_only_fields = ["date_joined"]

class AdminUserProfileSerializer(serializers.Serializer):
    """
    Полный профиль пользователя для админа:
    User + UserProfile + UserNotificationSettings
    """
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)

    email = serializers.EmailField()
    first_name = serializers.CharField(allow_blank=True, required=False)
    last_name = serializers.CharField(allow_blank=True, required=False)

    phone = serializers.CharField(
        allow_blank=True, allow_null=True, required=False
    )
    telegram_username = serializers.CharField(
        allow_blank=True, allow_null=True, required=False
    )

    notify_email = serializers.BooleanField(required=False)
    notify_telegram = serializers.BooleanField(required=False)

    def to_representation(self, instance: User):
        profile = getattr(instance, "profile", None)
        notif = getattr(instance, "notification_settings", None)

        return {
            "id": instance.id,
            "username": instance.username,
            "email": instance.email or "",
            "first_name": instance.first_name or "",
            "last_name": instance.last_name or "",
            "phone": (profile.phone if profile and profile.phone else "") if profile else "",
            "telegram_username": (
                profile.telegram_username
                if profile and profile.telegram_username
                else ""
            )
            if profile
            else "",
            "notify_email": notif.notify_email if notif else True,
            "notify_telegram": notif.notify_telegram if notif else False,
        }

    def update(self, instance: User, validated_data):
        # Обновляем сам User
        for field in ["email", "first_name", "last_name"]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()

        # Профиль
        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if "phone" in validated_data:
            profile.phone = validated_data["phone"]
        if "telegram_username" in validated_data:
            profile.telegram_username = validated_data["telegram_username"]
        profile.save()

        # Настройки уведомлений
        notif, _ = UserNotificationSettings.objects.get_or_create(user=instance)
        if "notify_email" in validated_data:
            notif.notify_email = validated_data["notify_email"]
        if "notify_telegram" in validated_data:
            notif.notify_telegram = validated_data["notify_telegram"]
        notif.save()

        return instance

    def create(self, validated_data):
        # не используется, админ не создаёт пользователей через этот сериализатор
        raise NotImplementedError("create() не используется для AdminUserProfileSerializer")


class UserMeSerializer(serializers.Serializer):
    """
    Профиль текущего пользователя: User + UserProfile + UserNotificationSettings
    """


    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(allow_blank=True, required=False)
    first_name = serializers.CharField(allow_blank=True, required=False)
    last_name = serializers.CharField(allow_blank=True, required=False)

    phone = serializers.CharField(allow_blank=True, required=False)
    telegram_username = serializers.CharField(allow_blank=True, required=False)
    company = serializers.CharField(allow_blank=True, required=False)


    notify_email = serializers.BooleanField(required=False)
    notify_telegram = serializers.BooleanField(required=False)
    notify_types = serializers.CharField(allow_blank=True, required=False)

    def to_representation(self, instance):
        """
        instance — это словарь {"user": ..., "profile": ..., "settings": ...}
        """
        user = instance["user"]
        profile = instance["profile"]
        settings = instance["settings"]

        return {
            "username": user.username,
            "email": user.email or "",
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "phone": profile.phone or "",
            "telegram_username": profile.telegram_username or "",
            "company": profile.company or "",
            "notify_email": settings.notify_email,
            "notify_telegram": settings.notify_telegram,
            "notify_types": settings.notify_types or "",
        }

    def update(self, instance, validated_data):
        """
        Обновляем User, UserProfile и UserNotificationSettings.
        """
        user = instance["user"]
        profile = instance["profile"]
        settings = instance["settings"]


        if "email" in validated_data:
            user.email = validated_data["email"]
        if "first_name" in validated_data:
            user.first_name = validated_data["first_name"]
        if "last_name" in validated_data:
            user.last_name = validated_data["last_name"]
        user.save()


        if "phone" in validated_data:
            profile.phone = validated_data["phone"]
        if "telegram_username" in validated_data:
            profile.telegram_username = validated_data["telegram_username"]
        if "company" in validated_data:
            profile.company = validated_data["company"]
        profile.save()

        if "notify_email" in validated_data:
            settings.notify_email = validated_data["notify_email"]
        if "notify_telegram" in validated_data:
            settings.notify_telegram = validated_data["notify_telegram"]
        if "notify_types" in validated_data:
            settings.notify_types = validated_data["notify_types"]
        settings.save()

        return instance

