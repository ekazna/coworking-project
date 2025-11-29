# notifications/email_utils.py
from django.core.mail import send_mail
from django.conf import settings


def send_notification_email(user, title: str, message: str) -> bool:
    """
    Простая отправка письма на email пользователя.
    Возвращает True, если попытка отправки прошла без исключений.
    Для dev с console backend письма будут просто выводиться в консоль.
    """
    email = getattr(user, "email", None)
    if not email:
        return False

    subject = title or "Уведомление от коворкинга"
    body = message or ""

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None)

    try:
        send_mail(
            subject,
            body,
            from_email,
            [email],
            fail_silently=False,  # пусть кидает исключение, мы его поймаем сверху
        )
        return True
    except Exception:
        return False
