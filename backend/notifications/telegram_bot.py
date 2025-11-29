import time
import requests
import django
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth.models import User
from users.models import UserProfile
from django.conf import settings


BOT_TOKEN = settings.TELEGRAM_BOT_TOKEN
API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"


def get_updates(offset=None):
    params = {"timeout": 60}
    if offset:
        params["offset"] = offset
    r = requests.get(f"{API_URL}/getUpdates", params=params)
    return r.json()


def save_chat_id(username, chat_id):
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        print(f"❌ User {username} not found in Django")
        return

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.telegram_chat_id = chat_id
    profile.save()

    print(f"✅ Saved telegram_chat_id={chat_id} for user={username}")


def run_polling():
    print("🚀 Telegram polling bot started. Waiting for /start...")
    offset = None

    while True:
        updates = get_updates(offset)

        if "result" in updates:
            for upd in updates["result"]:
                offset = upd["update_id"] + 1

                if "message" not in upd:
                    continue

                msg = upd["message"]
                chat_id = msg["chat"]["id"]

                text = msg.get("text", "")
                username = msg["from"].get("username")  # Telegram username

                if text == "/start":
                    print(f"📩 /start from @{username} (chat_id={chat_id})")

                    # Пробуем найти юзера по telegram_username
                    try:
                        profile = UserProfile.objects.get(telegram_username=username)
                        profile.telegram_chat_id = chat_id
                        profile.save()
                        print(f"✅ chat_id saved for user {profile.user.username}")
                    except UserProfile.DoesNotExist:
                        print(f"⚠ No user with telegram_username={username}")

        time.sleep(1)
