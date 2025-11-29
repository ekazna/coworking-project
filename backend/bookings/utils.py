# backend/bookings/utils.py
from datetime import timedelta

def round_to_next_15(dt):
    """
    Округляем datetime вверх до следующего 15-минутного интервала.
    """
    minute_block = (dt.minute // 15) * 15
    if dt.minute % 15 != 0:
        minute_block += 15

    if minute_block >= 60:
        dt = dt.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    else:
        dt = dt.replace(minute=minute_block, second=0, microsecond=0)
    return dt
