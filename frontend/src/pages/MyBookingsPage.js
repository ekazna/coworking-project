// src/pages/MyBookingsPage.js
import React, {
  useEffect,
  useState,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import "../styles/MyBookingsPage.css";

const MyBookingsPage = () => {
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD
  const [monthFilter, setMonthFilter] = useState(""); // YYYY-MM
  const [timeFormatFilter, setTimeFormatFilter] = useState("all"); // hour/day/month
  const [typeFilter, setTypeFilter] = useState("all"); // тип рабочего места
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // состояние для "Проблема"
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueBookingId, setIssueBookingId] = useState(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState(null);
  const [issueMessage, setIssueMessage] = useState(null);

  // ---------------------------------------------
  // Хелперы форматирования
  // ---------------------------------------------
  const formatDateTime = (iso) => {
    if (!iso) return "";

    // ожидаем ISO вида 2025-11-27T12:00:00Z или без Z
    const [datePart, timePartRaw] = iso.split("T");
    if (!datePart || !timePartRaw) return iso;

    const [year, month, day] = datePart.split("-");
    const timePart = timePartRaw.slice(0, 5); // HH:MM

    return `${day}.${month}.${year} ${timePart}`;
  };

  const formatTimeFormat = (tf) => {
    if (tf === "hour") return "Часы";
    if (tf === "day") return "День";
    if (tf === "month") return "Месяц";
    return tf || "";
  };

  const formatStatus = (status) => {
    if (status === "active") return "Активное";
    if (status === "cancelled") return "Отменено";
    if (status === "finished") return "Завершено";
    if (status === "conflicted") return "Конфликт";
    return status || "";
  };

  // ---------------------------------------------
  // ЗАГРУЗКА БРОНЕЙ
  // ---------------------------------------------
  const fetchBookings = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const params = {
        booking_type: "workspace",
      };

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      const response = await api.get("/bookings/my/", { params });

      let data = response.data || [];

      // гарантируем, что только workspace
      data = data.filter((b) => b.booking_type === "workspace");

      // фильтр по типу рабочего места
      if (typeFilter !== "all") {
        data = data.filter((b) => {
          const t = b.resource?.type;
          return t && String(t.id) === String(typeFilter);
        });
      }

      // фильтр по формату времени
      if (timeFormatFilter !== "all") {
        data = data.filter((b) => b.time_format === timeFormatFilter);
      }

      // фильтр по дате
      if (dateFilter) {
        const dayStart = new Date(`${dateFilter}T00:00:00`);
        const dayEnd = new Date(`${dateFilter}T23:59:59`);

        data = data.filter((b) => {
          if (!b.start_datetime || !b.end_datetime) return false;
          const start = new Date(b.start_datetime);
          const end = new Date(b.end_datetime);
          return end >= dayStart && start <= dayEnd;
        });
      }

      // фильтр по месяцу
      if (monthFilter) {
        const [yearStr, monthStr] = monthFilter.split("-");
        const year = Number(yearStr);
        const month = Number(monthStr);

        if (!Number.isNaN(year) && !Number.isNaN(month)) {
          const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
          const monthEnd = new Date(year, month, 0, 23, 59, 59);

          data = data.filter((b) => {
            if (!b.start_datetime || !b.end_datetime) return false;
            const start = new Date(b.start_datetime);
            const end = new Date(b.end_datetime);
            return end >= monthStart && start <= monthEnd;
          });
        }
      }

      setBookings(data);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить список бронирований");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFilter, monthFilter, timeFormatFilter, typeFilter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // ---------------------------------------------
  // Обработчики фильтров
  // ---------------------------------------------
  const handleStatusChange = (e) => setStatusFilter(e.target.value);
  const handleDateChange = (e) => setDateFilter(e.target.value);
  const handleResetDate = () => setDateFilter("");
  const handleMonthChange = (e) => setMonthFilter(e.target.value);
  const handleResetMonth = () => setMonthFilter("");
  const handleTimeFormatChange = (e) => setTimeFormatFilter(e.target.value);

  const handleResetAllFilters = () => {
    setStatusFilter("all");
    setDateFilter("");
    setMonthFilter("");
    setTimeFormatFilter("all");
    setTypeFilter("all");
  };

  // ---------------------------------------------
  // Действия по броням
  // ---------------------------------------------
  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm("Вы действительно хотите отменить это бронирование?")) {
      return;
    }

    try {
      await api.post(`/bookings/${bookingId}/cancel/`);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert("Не удалось отменить бронирование");
    }
  };

  const openBookingDetail = (bookingId) => {
    navigate(`/my-bookings/${bookingId}`);
  };

  // ---------------------------------------------
  // ПРОБЛЕМЫ
  // ---------------------------------------------
  const handleOpenIssueModal = (bookingId) => {
    setIssueBookingId(bookingId);
    setIssueDescription("");
    setIssueError(null);
    setIssueMessage(null);
    setIssueModalOpen(true);
  };

  const handleCloseIssueModal = () => {
    setIssueModalOpen(false);
    setIssueBookingId(null);
    setIssueDescription("");
    setIssueError(null);
    setIssueMessage(null);
  };

  const handleQuickIssueSubmit = async (e) => {
    e.preventDefault();

    if (!issueBookingId) {
      setIssueError("Не выбрана бронь");
      return;
    }
    if (!issueDescription.trim()) {
      setIssueError("Пожалуйста, опишите проблему");
      return;
    }

    setIssueLoading(true);
    setIssueError(null);
    setIssueMessage(null);

    try {
      const response = await api.post("/issues/", {
        issue_type: "workspace",
        booking_id: issueBookingId,
        description: issueDescription.trim(),
      });

      console.log("ISSUE CREATED:", response.data);
      setIssueMessage("Заявка создана");

      setTimeout(() => {
        handleCloseIssueModal();
      }, 300);
    } catch (err) {
      console.error(err);
      setIssueError("Не удалось отправить заявку");
    } finally {
      setIssueLoading(false);
    }
  };

  // список типов мест для селекта
  const workspaceTypes = Array.from(
    new Map(
      bookings
        .filter((b) => b.resource && b.resource.type)
        .map((b) => [b.resource.type.id, b.resource.type])
    ).values()
  );

  // ---------------------------------------------
  // UI
  // ---------------------------------------------
  return (
    <div className="mybookings-page">
      <div className="mybookings-container" style={{ maxWidth: "1200px" }}>
        <h2 className="mybookings-title">Мои бронирования (рабочие места)</h2>

        {/* Фильтры */}
        <div className="mybookings-filters">
          <div className="mybookings-filter-block">
            <span className="mybookings-filter-label">Статус</span>
            <select
              value={statusFilter}
              onChange={handleStatusChange}
              className="mybookings-select"
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="cancelled">Отменённые</option>
              <option value="finished">Завершённые</option>
              <option value="conflicted">Конфликтные</option>
            </select>
          </div>

          <div className="mybookings-filter-block">
            <span className="mybookings-filter-label">Формат</span>
            <select
              value={timeFormatFilter}
              onChange={handleTimeFormatChange}
              className="mybookings-select"
            >
              <option value="all">Все</option>
              <option value="hour">Часы</option>
              <option value="day">День</option>
              <option value="month">Месяц</option>
            </select>
          </div>

          <div className="mybookings-filter-block">
            <span className="mybookings-filter-label">Тип рабочего места</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="mybookings-select"
            >
              <option value="all">Все</option>
              {workspaceTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mybookings-filter-block">
            <span className="mybookings-filter-label">Дата</span>
            <input
              type="date"
              value={dateFilter}
              onChange={handleDateChange}
              className="mybookings-input"
            />
            {dateFilter && (
              <button type="button" className="mybookings-btn" onClick={handleResetDate}>
                Сбросить дату
              </button>
            )}
          </div>

          <div className="mybookings-filter-block">
            <span className="mybookings-filter-label">Месяц</span>
            <input
              type="month"
              value={monthFilter}
              onChange={handleMonthChange}
              className="mybookings-input"
            />
            {monthFilter && (
              <button type="button" className="mybookings-btn" onClick={handleResetMonth}>
                Сбросить месяц
              </button>
            )}
          </div>

          <div className="mybookings-filter-block">
            <span className="mybookings-filter-label">&nbsp;</span>
            <button type="button" className="mybookings-btn" onClick={handleResetAllFilters}>
              Сбросить фильтры
            </button>
          </div>
        </div>

        {loading && <p>Загрузка...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
        {!loading && bookings.length === 0 && !error && (
          <p>По заданным фильтрам бронирований нет.</p>
        )}

        {!loading && bookings.length > 0 && (
          <table className="mybookings-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Ресурс</th>
                <th>Тип</th>
                <th>Формат</th>
                <th>Начало</th>
                <th>Окончание</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>

            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td>
                  <td>
                    {b.resource?.name ||
                      `Ресурс #${b.resource?.id ?? "неизвестен"}`}
                  </td>
                  <td>{b.resource?.type?.name || "—"}</td>
                  <td>{formatTimeFormat(b.time_format)}</td>
                  <td>{formatDateTime(b.start_datetime)}</td>
                  <td>{formatDateTime(b.end_datetime)}</td>
                  <td>{formatStatus(b.status)}</td>
                  <td className="mybookings-actions">
                    <button
                      className="mybookings-btn mybookings-btn-info"
                      onClick={() => openBookingDetail(b.id)}
                    >
                      Подробнее
                    </button>

                    {b.status === "active" && b.booking_type === "workspace" && (
                      <button
                        className="mybookings-btn mybookings-btn-blue"
                        onClick={() => navigate(`/bookings/${b.id}/extend`)}
                      >
                        Продлить
                      </button>
                    )}

                    {b.status === "active" && (
                      <button
                        className="mybookings-btn mybookings-btn-red"
                        onClick={() => handleCancelBooking(b.id)}
                      >
                        Отменить
                      </button>
                    )}

                    {b.status === "active" && (
                      <button
                        className="mybookings-btn mybookings-btn-yellow"
                        onClick={() => handleOpenIssueModal(b.id)}
                      >
                        Проблема
                      </button>
                    )}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Модалка проблемы */}
        {issueModalOpen && (
          <div className="mybookings-modal-overlay">
            <div className="mybookings-modal">
              <h3>Сообщить о проблеме по бронированию #{issueBookingId}</h3>

              <form onSubmit={handleQuickIssueSubmit}>
                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{ display: "block", marginBottom: 4 }}
                  >
                    Описание проблемы:
                  </label>
                  <textarea
                    style={{width: 450}}
                    rows={4}
                    value={issueDescription}
                    onChange={(e) =>
                      setIssueDescription(e.target.value)
                    }
                    placeholder="Опишите, что случилось"
                  />
                </div>

                {issueError && (
                  <p style={{ color: "red", marginBottom: 8 }}>
                    {issueError}
                  </p>
                )}
                {issueMessage && (
                  <p style={{ color: "green", marginBottom: 8 }}>
                    {issueMessage}
                  </p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="mybookings-btn" disabled={issueLoading}>
                    {issueLoading ? "Отправляем..." : "Отправить"}
                  </button>
                  <button
                    type="button"
                    className="mybookings-btn"
                    onClick={handleCloseIssueModal}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyBookingsPage;
