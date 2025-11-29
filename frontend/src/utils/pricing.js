// Fallback-тарифы на случай, если с бэка не пришли ставки
const FALLBACK_RATES = {
  workspace: {
    hour: 300,
    day: 1500,
    month: 20000,
  },
  equipment: {
    hour: 150,
    day: 800,
    month: 10000,
  },
};

function safeParseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Достаём ставку из booking.resource.type.*
 * Ожидаем структуру примерно:
 * booking.resource.type.hourly_rate / daily_rate / monthly_rate
 * (DRF вернёт decimal как строку "300.00")
 */
function getRateFromBooking(booking, timeFormat) {
  if (!booking || !booking.resource || typeof booking.resource !== "object") {
    return null;
  }

  const t = booking.resource.type;
  if (!t) return null;

  let raw = null;
  if (timeFormat === "hour") raw = t.hourly_rate;
  else if (timeFormat === "day") raw = t.daily_rate;
  else if (timeFormat === "month") raw = t.monthly_rate;

  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

/**
 * Фоллбек — если с бэка не пришли ставки
 */
function getFallbackRate(booking, timeFormat) {
  const bt = booking?.booking_type || "workspace";
  const typeKey = bt === "equipment" ? "equipment" : "workspace";
  const map = FALLBACK_RATES[typeKey];

  if (timeFormat === "day") return map.day;
  if (timeFormat === "month") return map.month;
  return map.hour;
}

/**
 * Основной расчёт стоимости брони.
 */
export function calculateBookingPrice(booking) {
  if (!booking) return 0;

  const timeFormat = booking.time_format || "hour";
  const start = safeParseDate(booking.start_datetime);
  const end = safeParseDate(booking.end_datetime);

  if (!start || !end || end <= start) {
    return 0;
  }

  const diffMs = end.getTime() - start.getTime();

  // 1. Берём ставку с бэка, если есть
  let rate = getRateFromBooking(booking, timeFormat);

  // 2. Если нет — используем фоллбек
  if (rate === null) {
    rate = getFallbackRate(booking, timeFormat);
  }

  // 3. Считаем количество единиц (часы/дни/месяцы) и умножаем
  if (timeFormat === "day") {
    const days = diffMs / (1000 * 60 * 60 * 24);
    const billedDays = Math.max(1, Math.ceil(days));
    return billedDays * rate;
  }

  if (timeFormat === "month") {
    const days = diffMs / (1000 * 60 * 60 * 24);
    const months = days / 30; 
    const billedMonths = Math.max(1, Math.ceil(months));
    return billedMonths * rate;
  }

  // по умолчанию считаем по часам
  const hours = diffMs / (1000 * 60 * 60);
  const billedHours = Math.max(1, Math.ceil(hours));
  return billedHours * rate;
}
