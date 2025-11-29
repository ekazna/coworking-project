import requests
from django.conf import settings


def get_bot_token():
    return getattr(settings, "TELEGRAM_BOT_TOKEN", None)


def send_telegram_message(chat_id: str, text: str) -> bool:
    """
    Простая отправка сообщения в Telegram.
    Возвращает True/False, без выброса исключений.
    """

    token = get_bot_token()
    if not token:
        print("[Telegram] No TELEGRAM_BOT_TOKEN in settings.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }

    try:
        r = requests.post(url, json=payload, timeout=5)
        if r.status_code != 200:
            print("[Telegram] Failed:", r.text)
            return False
        data = r.json()
        return bool(data.get("ok"))
    except Exception as e:
        print("[Telegram] Exception:", e)
        return False
        
