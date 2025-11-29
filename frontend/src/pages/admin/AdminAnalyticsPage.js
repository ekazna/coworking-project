// src/pages/admin/AdminAnalyticsPage.js
import React, { useEffect, useState, useMemo } from "react";
import api from "../../api";

const COWORKING_TIMEZONE = "Europe/Moscow";

const AdminAnalyticsPage = () => {
  const [bookings, setBookings] = useState([]);
  const [outages, setOutages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---- форматирование дат ----
  const formatDateTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return String(iso).replace("T", " ").slice(0, 16);
    }
    return d.toLocaleString("ru-RU", {
      timeZone: COWORKING_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return String(iso).slice(0, 10);
    }
    return d.toLocaleDateString("ru-RU", {
      timeZone: COWORKING_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // ---- загрузка данных ----
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [bookingsResp, outagesResp] = await Promise.all([
          api.get("/bookings/"),
          api.get("/resource-outages/?current=1"),
        ]);
        setBookings(bookingsResp.data || []);
        setOutages(outagesResp.data || []);
      } catch (err) {
        console.error(err);
        setError("Не удалось загрузить данные для аналитики");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ---- расчёт агрегатов ----
  const {
    totalBookings,
    activeNow,
    conflictedCount,
    cancelledCount,
    completedCount,
    uniqueClientsCount,
    byType,
    todayStats,
  } = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

    let total = bookings.length;
    let active = 0;
    let conflicted = 0;
    let cancelled = 0;
    let completed = 0;

    const clientKeys = new Set();
    const byTypeLocal = {
      workspace: 0,
      equipment: 0,
      other: 0,
    };

    let todayTotal = 0;
    let todayActiveNow = 0;

    bookings.forEach((b) => {
      const status = (b.status || "").toLowerCase();
      const type = b.booking_type || "other";

      if (status === "conflicted") conflicted += 1;
      if (status === "cancelled" || status === "canceled") cancelled += 1;
      if (status === "completed") completed += 1;

      // тип брони
      if (type === "workspace" || type === "equipment") {
        byTypeLocal[type] += 1;
      } else {
        byTypeLocal.other += 1;
      }

      // уникальные клиенты
      const userObj = b.user || {};
      const key =
        userObj.id ||
        userObj.username ||
        userObj.email ||
        b.user_email ||
        `anon-${b.id}`;
      clientKeys.add(key);

      // активность по времени
      const start = b.start_datetime ? new Date(b.start_datetime) : null;
      const end = b.end_datetime ? new Date(b.end_datetime) : null;

      if (start && end && !Number.isNaN(start) && !Number.isNaN(end)) {
        if (start <= now && now < end) {
          active += 1;
        }

        const startKey = start.toISOString().slice(0, 10);
        if (startKey === todayKey) {
          todayTotal += 1;
          if (start <= now && now < end) {
            todayActiveNow += 1;
          }
        }
      }
    });

    return {
      totalBookings: total,
      activeNow: active,
      conflictedCount: conflicted,
      cancelledCount: cancelled,
      completedCount: completed,
      uniqueClientsCount: clientKeys.size,
      byType: byTypeLocal,
      todayStats: {
        todayTotal,
        todayActiveNow,
        todayDate: todayKey,
      },
    };
  }, [bookings]);

  if (loading) {
    return <div style={{ margin: 20 }}>Загрузка аналитики...</div>;
  }

  if (error) {
    return (
      <div style={{ margin: 20, color: "red" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 10px" }}>
      <h2>Админ: аналитика</h2>

      {/* ---- Общая статистика ---- */}
      <section style={{ marginTop: 16 }}>
        <h3>Общая статистика по бронированиям</h3>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginTop: 8,
          }}
        >
          <StatCard label="Всего бронирований" value={totalBookings} />
          <StatCard label="Активно сейчас" value={activeNow} />
          <StatCard label="Конфликтных" value={conflictedCount} />
          <StatCard label="Отменённых" value={cancelledCount} />
          <StatCard label="Завершённых" value={completedCount} />
          <StatCard label="Клиентов с бронями" value={uniqueClientsCount} />
        </div>
      </section>

      {/* ---- Сегодня ---- */}
      <section style={{ marginTop: 24 }}>
        <h3>Сегодня ({formatDate(todayStats.todayDate)})</h3>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginTop: 8,
          }}
        >
          <StatCard
            label="Новых броней cегодня"
            value={todayStats.todayTotal}
          />
          <StatCard
            label="Из них активны сейчас"
            value={todayStats.todayActiveNow}
          />
        </div>
      </section>

      {/* ---- Разбивка по типам ---- */}
      <section style={{ marginTop: 24 }}>
        <h3>Бронирования по типам</h3>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 8,
            fontSize: "0.95em",
          }}
        >
          <thead>
            <tr>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 6 }}>
                Тип
              </th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "right", padding: 6 }}>
                Кол-во
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                Рабочие места
              </td>
              <td
                style={{
                  borderBottom: "1px solid #eee",
                  padding: 6,
                  textAlign: "right",
                }}
              >
                {byType.workspace}
              </td>
            </tr>
            <tr>
              <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                Оборудование
              </td>
              <td
                style={{
                  borderBottom: "1px solid #eee",
                  padding: 6,
                  textAlign: "right",
                }}
              >
                {byType.equipment}
              </td>
            </tr>
            {byType.other > 0 && (
              <tr>
                <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                  Другие типы
                </td>
                <td
                  style={{
                    borderBottom: "1px solid #eee",
                    padding: 6,
                    textAlign: "right",
                  }}
                >
                  {byType.other}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ---- Текущие outages ---- */}
      <section style={{ marginTop: 32, marginBottom: 40 }}>
        <h3>Ресурсы, выведенные из работы (outage сейчас)</h3>

        {outages.length === 0 ? (
          <p style={{ marginTop: 8 }}>Сейчас нет ресурсов, выведенных из работы.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 8,
              fontSize: "0.95em",
            }}
          >
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Ресурс
                </th>
                <th style={{ borderBottom: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Период
                </th>
                <th style={{ borderBottom: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Причина
                </th>
              </tr>
            </thead>
            <tbody>
              {outages.map((o) => {
                const res = o.resource || {};
                const resourceName =
                  res.name ||
                  res.title ||
                  (typeof res === "string" ? res : `Ресурс #${res.id ?? o.resource}`);

                return (
                  <tr key={o.id}>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                      {resourceName}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                      {formatDateTime(o.start_datetime)} —{" "}
                      {formatDateTime(o.end_datetime)}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>
                      {o.reason === "issue"
                        ? "Неисправность (issue)"
                        : o.reason === "maintenance"
                        ? "Плановое обслуживание"
                        : o.reason === "broken"
                        ? "Выведен из работы"
                        : o.reason || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

const StatCard = ({ label, value }) => (
  <div
    style={{
      flex: "1 1 180px",
      minWidth: 180,
      border: "1px solid #ddd",
      borderRadius: 4,
      padding: 12,
      background: "#fafafa",
    }}
  >
    <div style={{ fontSize: "0.85em", color: "#555" }}>{label}</div>
    <div style={{ fontSize: "1.4em", fontWeight: "bold", marginTop: 4 }}>
      {value}
    </div>
  </div>
);

export default AdminAnalyticsPage;
