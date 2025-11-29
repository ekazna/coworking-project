# notifications/utils.py
from django.utils import timezone

from .models import Notification
from .email_utils import send_notification_email
from .telegram import send_telegram_message


# Полный список событий, для которых вообще пытаемся что-то отправлять
EVENTS_SUPPORTED = {
    # бронирования
    "booking_created",
    "booking_extended",
    "booking_cancelled",
    "booking_reassigned",
    "booking_conflicted",

    # обращения
    "issue_created",
    "issue_confirmed",
    "issue_rejected",

    # услуги
    "service_order_created",
}


def format_dt(dt):
    """
    Красивое форматирование дат для писем/Telegram.
    29.11.2025 14:00
    """
    if not dt:
        return ""
    dt_local = timezone.localtime(dt)
    return dt_local.strftime("%d.%m.%Y %H:%M")


def _get_user_notification_settings(user):
    """
    Аккуратно достаём настройки, чтобы не ловить циклические импорты.
    Если настроек нет — возвращаем None.
    """
    try:
        from users.models import UserNotificationSettings
    except Exception:
        return None

    try:
        return UserNotificationSettings.objects.get(user=user)
    except UserNotificationSettings.DoesNotExist:
        return None


def should_send_email(event_type: str, user) -> bool:
    """
    Сейчас не используем notify_types — только галочку notify_email.
    Логика:
      - у пользователя должен быть email;
      - событие должно быть в EVENTS_SUPPORTED;
      - либо нет настроек, либо notify_email=True.
    """
    if not user or not getattr(user, "email", None):
        return False

    if event_type not in EVENTS_SUPPORTED:
        return False

    settings = _get_user_notification_settings(user)
    if settings and not settings.notify_email:
        return False

    return True


def should_send_telegram(event_type: str, user) -> bool:
    """
    Аналогично email, но:
      - требуется user.profile.telegram_chat_id;
      - галочка notify_telegram.
    """
    if not user:
        return False

    profile = getattr(user, "profile", None)
    chat_id = getattr(profile, "telegram_chat_id", None)
    if not chat_id:
        return False

    if event_type not in EVENTS_SUPPORTED:
        return False

    settings = _get_user_notification_settings(user)
    if settings and not settings.notify_telegram:
        return False

    return True


def create_notification(
    *,
    user,
    event_type,
    title,
    message,
    channel="internal",
    booking=None,
    issue=None,
    service_order=None,
    status="pending",
):
    """
    Универсальный помощник для создания записей Notification.

    Делает три вещи:
      1) создаёт запись в БД (internal log);
      2) если надо — шлёт email;
      3) если надо — шлёт Telegram.

    Статус Notification обновляем так:
      - если хотя бы один канал успешно ушёл → status='sent';
      - если пытались что-то отправить и всё упало → status='failed';
      - если ни один канал не должен отправляться → остаётся 'pending'.
    """
    notif = Notification.objects.create(
        user=user,
        event_type=event_type,
        title=title,
        message=message,
        channel=channel,
        booking=booking,
        issue=issue,
        service_order=service_order,
        status=status,
    )

    any_attempt = False
    any_success = False

    # --- E-MAIL ---
    if should_send_email(event_type, user):
        any_attempt = True
        ok = send_notification_email(user, title, message)
        if ok:
            any_success = True

    # --- TELEGRAM ---
    if should_send_telegram(event_type, user):
        any_attempt = True
        profile = getattr(user, "profile", None)
        chat_id = getattr(profile, "telegram_chat_id", None)
        if chat_id:
            ok = send_telegram_message(chat_id, f"<b>{title}</b>\n\n{message}")
            if ok:
                any_success = True

    # --- обновляем статус ---
    if any_attempt:
        notif.sent_at = timezone.now()
        notif.status = "sent" if any_success else "failed"
        notif.save(update_fields=["status", "sent_at"])

    return notif
