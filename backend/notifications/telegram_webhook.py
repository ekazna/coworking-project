import json

from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.models import User

from users.models import UserProfile, UserNotificationSettings
from .telegram import send_telegram_message


@csrf_exempt
def telegram_webhook(request):
    """
    Webhook-приёмник для Telegram.

    MVP-сценарий:
    - пользователь в ЛК видит инструкцию:
        "Отправьте боту команду: /start <ВАШ_ID_ПОЛЬЗОВАТЕЛЯ>"
    - в Telegram пишет боту: /start 42

    Логика:
      1. Разбираем update от Telegram.
      2. Если прилетела команда /start:
         - берём второй аргумент как код (ID пользователя).
         - ищем User(id=code).
         - создаём/обновляем UserProfile + UserNotificationSettings:
             * profile.telegram_chat_id = chat_id
             * profile.telegram_username = telegram username (если есть)
             * settings.notify_telegram = True
         - отправляем подтверждающее сообщение пользователю.
    """

    if request.method != "POST":
        return HttpResponseBadRequest("Invalid method")

    try:
        data = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON")

    message = data.get("message") or data.get("edited_message")
    if not message:

        return JsonResponse({"ok": True})

    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = message.get("text", "") or ""
    from_user = message.get("from") or {}

    if not chat_id or not text:
        return JsonResponse({"ok": True})

    text = text.strip()

    # --- Обработка /start ---
    if text.startswith("/start"):
        parts = text.split()
        if len(parts) == 1:
            send_telegram_message(
                chat_id,
                (
                    "👋 Привет! Чтобы привязать этот Telegram к аккаунту на сайте,\n"
                    "зайдите в личный кабинет и скопируйте код привязки.\n\n"
                    "Затем отправьте мне команду:\n"
                    "<code>/start ВАШ_КОД</code>"
                ),
            )
            return JsonResponse({"ok": True})

        code = parts[1]

        # MVP: код = ID пользователя (/start 42)
        user = None
        try:
            user_id = int(code)
            user = User.objects.filter(id=user_id).first()
        except (ValueError, TypeError):
            user = None

        if not user:
            send_telegram_message(
                chat_id,
                (
                    "❗ Не удалось найти аккаунт по этому коду.\n"
                    "Проверьте, что вы скопировали код привязки точно и полностью."
                ),
            )
            return JsonResponse({"ok": True})

        # --- Профиль пользователя (telegram_chat_id, username) ---
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.telegram_chat_id = chat_id
        # username из Telegram (если есть)
        tg_username = from_user.get("username")
        if tg_username:
            profile.telegram_username = tg_username
        profile.save(update_fields=["telegram_chat_id", "telegram_username"])

        # --- Настройки уведомлений ---
        settings, _ = UserNotificationSettings.objects.get_or_create(user=user)
        settings.notify_telegram = True
        settings.save(update_fields=["notify_telegram"])

        send_telegram_message(
            chat_id,
            (
                f"Telegram успешно привязан к аккаунту <b>{user.username or user.email}</b>.\n\n"
                "Теперь вы будете получать сюда уведомления о бронированиях и обращениях."
            ),
        )

        return JsonResponse({"ok": True})

    return JsonResponse({"ok": True})
