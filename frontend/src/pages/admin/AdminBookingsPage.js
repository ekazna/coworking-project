// src/pages/admin/AdminBookingsPage.js
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminBookingsPage.css";

const AdminBookingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---- фильтры ----
  const [clientSearch, setClientSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [bookingTypeFilter, setBookingTypeFilter] = useState("all");
  const [timeFormatFilter, setTimeFormatFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [monthFilter, setMonthFilter] = useState(""); // YYYY-MM
  const [resourceFilter, setResourceFilter] = useState("all");

  // 🔹 поиск по номеру брони
  const [bookingIdSearch, setBookingIdSearch] = useState("");

  // --- подхватываем client из query-параметра (?client=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const clientParam = params.get("client");
    if (clientParam) {
      setClientSearch(clientParam);
    }
  }, [location.search]);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/bookings/");
      setBookings(response.data || []);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить список бронирований");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancel = async (id) => {
    if (!window.confirm(`Отменить бронь #${id}?`)) return;

    try {
      await api.post(`/bookings/${id}/cancel/`);
      // после успешной отмены — обновляем список с сервера,
      // чтобы статус и дочерние брони были консистентны
      await fetchBookings();
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Не удалось отменить бронь";
      alert(msg);
    }
  };

  const handleShowDetails = (id) => {
    navigate(`/admin/bookings/${id}`);
  };

  // ---- утилиты ----
  const formatDateTime = (iso) => {
    if (!iso) return "";
    const [datePart, timeRaw] = iso.split("T");
    if (!datePart || !timeRaw) {
      return iso.replace("T", " ").slice(0, 16);
    }
    const [y, m, d] = datePart.split("-");
    const timePart = timeRaw.slice(0, 5);
    return `${d}.${m}.${y} ${timePart}`;
  };

  const formatTimeFormat = (fmt) => {
    switch (fmt) {
      case "hour":
        return "Часы";
      case "day":
        return "Дни";
      case "month":
        return "Месяц";
      default:
        return fmt || "";
    }
  };

  const formatStatusLabel = (status) => {
    switch (status) {
      case "active":
        return "Активна";
      case "cancelled":
      case "canceled":
        return "Отменена";
      case "completed":
        return "Завершена";
      case "conflicted":
        return "Конфликт";
      default:
        return status || "";
    }
  };

  const renderStatusBadge = (status) => {
    const label = formatStatusLabel(status);
    return (
      <span className={`booking-status booking-status-${status || "default"}`}>
        {label || "—"}
      </span>
    );
  };

  const renderTypeBadge = (type) => {
    let label = "—";
    if (type === "workspace") label = "Рабочее место";
    else if (type === "equipment") label = "Оборудование";
    else if (type) label = type;
    return <span className="booking-type-badge">{label}</span>;
  };

  const renderTimeFormatBadge = (fmt) => {
    const label = formatTimeFormat(fmt) || "—";
    return <span className="booking-time-badge">{label}</span>;
  };

  // ---- пресеты дат ----
  const todayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const setPresetToday = () => {
    const t = todayStr();
    setDateFrom(t);
    setDateTo(t);
    setMonthFilter("");
  };

  const setPresetTomorrow = () => {
    const t = tomorrowStr();
    setDateFrom(t);
    setDateTo(t);
    setMonthFilter("");
  };

  const setPresetThisWeek = () => {
    const d = new Date();
    const dayOfWeek = d.getDay() || 7; // 1–7, где 1 — понедельник
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const toISODate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    setDateFrom(toISODate(monday));
    setDateTo(toISODate(sunday));
    setMonthFilter("");
  };

  const handleResetFilters = () => {
    setClientSearch("");
    setStatusFilter("all");
    setPeriodFilter("all");
    setBookingTypeFilter("all");
    setTimeFormatFilter("all");
    setDateFrom("");
    setDateTo("");
    setMonthFilter("");
    setResourceFilter("all");
    setBookingIdSearch("");
  };

  // 🔹 список уникальных ресурсов
  const uniqueResources = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      let resId = null;
      let resName = null;

      if (b.resource && typeof b.resource === "object") {
        resId = b.resource.id;
        resName = b.resource.name || `Ресурс #${b.resource.id}`;
      } else if (b.resource_id) {
        resId = b.resource_id;
        resName = `Ресурс #${b.resource_id}`;
      }

      if (resId && !map.has(resId)) {
        map.set(resId, resName);
      }
    });

    const arr = Array.from(map.entries()).map(([id, name]) => ({ id, name }));

    // сортировка по алфавиту
    arr.sort((a, b) =>
      a.name.localeCompare(b.name, "ru", { sensitivity: "base" })
    );

    return arr;
  }, [bookings]);

  // ---- применение фильтров ----
  const applyFilters = () => {
    const now = new Date();
    const bookingIdQuery = bookingIdSearch.trim().replace("#", "");

    return bookings.filter((b) => {
      // 🔹 фильтр по номеру брони
      if (bookingIdQuery) {
        if (!String(b.id).includes(bookingIdQuery)) {
          return false;
        }
      }

      // клиент (логин / email / имя)
      if (clientSearch.trim()) {
        const term = clientSearch.trim().toLowerCase();
        const u = b.user || {};
        const searchStr = [
          u.username,
          u.email,
          u.first_name,
          u.last_name,
          b.user_email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchStr.includes(term)) {
          return false;
        }
      }

      // ресурс
      if (resourceFilter !== "all") {
        let resId = null;
        if (b.resource && typeof b.resource === "object") {
          resId = b.resource.id;
        } else if (b.resource_id) {
          resId = b.resource_id;
        }
        if (!resId || String(resId) !== resourceFilter) {
          return false;
        }
      }

      // статус
      if (statusFilter !== "all") {
        const st = (b.status || "").toLowerCase();
        if (st !== statusFilter) {
          return false;
        }
      }

      // период
      const start = b.start_datetime ? new Date(b.start_datetime) : null;
      const end = b.end_datetime ? new Date(b.end_datetime) : null;

      if (periodFilter !== "all" && start && end) {
        if (periodFilter === "past" && !(end < now)) return false;
        if (periodFilter === "current" && !(start <= now && now < end)) {
          return false;
        }
        if (periodFilter === "future" && !(start > now)) return false;
      }

      // тип брони
      if (bookingTypeFilter !== "all") {
        if (b.booking_type !== bookingTypeFilter) return false;
      }

      // формат времени
      if (timeFormatFilter !== "all") {
        if (b.time_format !== timeFormatFilter) return false;
      }

      // даты
      if (start) {
        if (dateFrom) {
          const df = new Date(dateFrom + "T00:00:00");
          if (start < df) return false;
        }
        if (dateTo) {
          const dt = new Date(dateTo + "T23:59:59");
          if (start > dt) return false;
        }
      }

      // месяц
      if (monthFilter && start) {
        const [y, m] = monthFilter.split("-");
        const monthYear = `${start.getFullYear()}-${String(
          start.getMonth() + 1
        ).padStart(2, "0")}`;
        if (monthYear !== `${y}-${m}`) return false;
      }

      return true;
    });
  };

  const filteredBookings = applyFilters();

  return (
    <div className="admin-bookings-page">
      <div className="admin-bookings-container">
        <h2 className="admin-bookings-title">Все бронирования</h2>

        {error && <p className="admin-alert-error">{error}</p>}
        {loading && <p className="admin-muted">Загрузка...</p>}

        {/* Фильтры */}
        <div className="admin-bookings-filters">
          {/* 1. Поисковые строки */}
          <div className="admin-bookings-row admin-bookings-row-inputs">
            <label className="admin-filter-label">
              Номер брони
              <input
                type="text"
                className="admin-input"
                placeholder="#123"
                value={bookingIdSearch}
                onChange={(e) => setBookingIdSearch(e.target.value)}
              />
            </label>

            <label className="admin-filter-label">
              Клиент (логин / email)
              <input
                type="text"
                className="admin-input"
                placeholder="Поиск клиента"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </label>
          </div>

          {/* 2. Селекты */}
          <div className="admin-bookings-row admin-bookings-row-selects">
            <label className="admin-filter-label">
              Ресурс
              <select
                className="admin-select"
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
              >
                <option value="all">Все ресурсы</option>
                {uniqueResources.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-filter-label">
              Статус
              <select
                className="admin-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Все статусы</option>
                <option value="active">Активные</option>
                <option value="cancelled">Отменённые</option>
                <option value="completed">Завершённые</option>
                <option value="conflicted">Конфликтные</option>
              </select>
            </label>

            <label className="admin-filter-label">
              Период
              <select
                className="admin-select"
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
              >
                <option value="all">Все периоды</option>
                <option value="current">Текущие</option>
                <option value="future">Будущие</option>
                <option value="past">Прошедшие</option>
              </select>
            </label>

            <label className="admin-filter-label">
              Тип
              <select
                className="admin-select"
                value={bookingTypeFilter}
                onChange={(e) => setBookingTypeFilter(e.target.value)}
              >
                <option value="all">Все типы</option>
                <option value="workspace">Рабочие места</option>
                <option value="equipment">Оборудование</option>
              </select>
            </label>

            <label className="admin-filter-label">
              Формат
              <select
                className="admin-select"
                value={timeFormatFilter}
                onChange={(e) => setTimeFormatFilter(e.target.value)}
              >
                <option value="all">Любой формат</option>
                <option value="hour">По часам</option>
                <option value="day">По дням</option>
                <option value="month">По месяцам</option>
              </select>
            </label>
          </div>

          {/* 3. Даты */}
          <div className="admin-bookings-row admin-bookings-row-dates">
            <label className="admin-filter-label">
              Дата от
              <input
                type="date"
                className="admin-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>

            <label className="admin-filter-label">
              Дата до
              <input
                type="date"
                className="admin-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>

            <label className="admin-filter-label">
              Месяц
              <input
                type="month"
                className="admin-input"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </label>
          </div>

          {/* 4. Пресеты и сброс */}
          <div className="admin-bookings-row admin-bookings-row-buttons">
            <div className="admin-bookings-presets">
              <span className="admin-presets-label">Быстрые пресеты:</span>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-small"
                onClick={setPresetToday}
              >
                Сегодня
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-small"
                onClick={setPresetTomorrow}
              >
                Завтра
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-small"
                onClick={setPresetThisWeek}
              >
                Эта неделя
              </button>
            </div>

            <div className="admin-bookings-reset">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={handleResetFilters}
              >
                Сбросить фильтры
              </button>
            </div>
          </div>
        </div>

        {/* Таблица */}
        {!loading && filteredBookings.length === 0 ? (
          <p className="admin-muted">
            Нет бронирований, удовлетворяющих текущим фильтрам.
          </p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Пользователь</th>
                  <th>Ресурс</th>
                  <th>Тип</th>
                  <th>Формат</th>
                  <th>Начало</th>
                  <th>Конец</th>
                  <th>Статус</th>
                  <th className="admin-table-actions">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr key={b.id}>
                    <td>#{b.id}</td>
                    <td>
                      {typeof b.user === "string"
                        ? b.user
                        : b.user?.username ||
                          b.user?.email ||
                          b.user_email ||
                          "-"}
                    </td>
                    <td>
                      {typeof b.resource === "string"
                        ? b.resource
                        : b.resource?.name || `Ресурс #${b.resource?.id}`}
                    </td>
                    <td>{renderTypeBadge(b.booking_type)}</td>
                    <td>{renderTimeFormatBadge(b.time_format)}</td>
                    <td>{formatDateTime(b.start_datetime)}</td>
                    <td>{formatDateTime(b.end_datetime)}</td>
                    <td>{renderStatusBadge(b.status)}</td>
                    <td className="admin-table-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn-small"
                        onClick={() => handleShowDetails(b.id)}
                      >
                        Подробнее
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-small"
                        onClick={() => handleCancel(b.id)}
                        // ✅ админ может отменять и active, и conflicted (как в бэке)
                        disabled={
                          !(
                            (b.status || "").toLowerCase() === "active" ||
                            (b.status || "").toLowerCase() === "conflicted"
                          )
                        }
                        style={{ marginLeft: 6 }}
                      >
                        Отменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminBookingsPage;
