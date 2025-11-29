// src/pages/BookingDetailPage.js
import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import "../styles/BookingDetailPage.css";

const BookingDetailPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---- оборудование к брони ----
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [equipmentTypeId, setEquipmentTypeId] = useState("");
  const [equipmentQuantity, setEquipmentQuantity] = useState(1);
  const [equipment1Error, setEquipment1Error] = useState(null);
  const [equipment2Error, setEquipment2Error] = useState(null);
  const [equipmentSuccess, setEquipmentSuccess] = useState(null);
  const [addingEquipment, setAddingEquipment] = useState(false);
  const [equipmentActionLoading, setEquipmentActionLoading] = useState(false);

  // 🔹 обращения по этой брони
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState(null);

  // 🔹 модалка "Пожаловаться"
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueErrorMessage, setIssueErrorMessage] = useState(null);
  const [issueSuccessMessage, setIssueSuccessMessage] = useState(null);

  // ===== ВСПОМОГАТЕЛЬНЫЕ ХЕЛПЕРЫ ДЛЯ ЦЕНЫ =====

  const formatDateTime = (dt) => {
    if (!dt) return "";
    const [datePart, timeRaw] = dt.split("T");
    if (!datePart || !timeRaw) return dt;
    const [y, m, d] = datePart.split("-");
    const timePart = timeRaw.slice(0, 5); // HH:MM
    return `${d}.${m}.${y} ${timePart}`;
  };

  const formatStatus = (s) => {
    switch (s) {
      case "active":
        return "активна";
      case "cancelled":
      case "canceled":
        return "отменена";
      case "completed":
      case "finished":
        return "завершена";
      case "conflicted":
        return "есть проблема";
      default:
        return s || "";
    }
  };

  const formatMoney = (value) => {
    const num = Number(value || 0);
    if (Number.isNaN(num)) return "—";
    return `${num.toFixed(0)} ₽`;
  };

  const getRatesFromBooking = (b) => {
    const t = b?.resource?.type;
    if (!t) return { hourly_rate: null, daily_rate: null, monthly_rate: null };
    return {
      hourly_rate: t.hourly_rate ? Number(t.hourly_rate) : null,
      daily_rate: t.daily_rate ? Number(t.daily_rate) : null,
      monthly_rate: t.monthly_rate ? Number(t.monthly_rate) : null,
    };
  };

  const calcDuration = (b) => {
    if (!b?.start_datetime || !b?.end_datetime) {
      return { hours: 0, days: 0, months: 0 };
    }
    const start = new Date(b.start_datetime);
    const end = new Date(b.end_datetime);
    const ms = end - start;
    if (ms <= 0) return { hours: 0, days: 0, months: 0 };

    const hours = ms / (1000 * 60 * 60);
    const days = ms / (1000 * 60 * 60 * 24);
    const months = days / 30; // грубо, для ВКР достаточно

    return { hours, days, months };
  };

  const calculateBookingPrice = (b) => {
    if (!b) return 0;
    const { hourly_rate, daily_rate, monthly_rate } = getRatesFromBooking(b);
    const { hours, days, months } = calcDuration(b);

    if (b.time_format === "hour" && hourly_rate != null) {
      return hours * hourly_rate;
    }
    if (b.time_format === "day" && daily_rate != null) {
      return days * daily_rate;
    }
    if (b.time_format === "month" && monthly_rate != null) {
      return months * monthly_rate;
    }

    // если формат не совпал с тарифами — просто 0
    return 0;
  };

  // ===== ЗАГРУЗКА ДАННЫХ =====

  const fetchBooking = async () => {
    if (!bookingId) {
      setError("Не удалось загрузить данные о бронировании");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const resp = await api.get(`/bookings/${bookingId}/details/`);
      setBooking(resp.data);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить данные о бронировании");
    } finally {
      setLoading(false);
    }
  };

  const fetchIssues = async () => {
    setIssuesLoading(true);
    setIssuesError(null);
    try {
      const resp = await api.get("/issues/", {
        params: { booking: bookingId },
      });
      setIssues(resp.data || []);
    } catch (err) {
      console.error(err);
      setIssuesError("Не удалось загрузить обращения по этой брони");
    } finally {
      setIssuesLoading(false);
    }
  };

  const fetchEquipmentTypes = async () => {
    try {
      const resp = await api.get("/resource-types/");
      const all = resp.data || [];

      const equipmentOnly = all.filter((t) => {
        const cat = t.category;
        if (cat && typeof cat === "object") {
          const code = (cat.code || "").toLowerCase();
          const name = (cat.name || "").toLowerCase();

          if (code === "equipment" || name.includes("оборуд")) return true;
          if (code === "workspace" || name.includes("рабоч")) return false;
        }

        const n = (t.name || "").toLowerCase();
        const equipmentKeywords = [
          "monitor",
          "монитор",
          "keyboard",
          "клавиатура",
          "mouse",
          "мышь",
          "headset",
          "науш",
          "webcam",
          "камера",
        ];
        const workspaceKeywords = [
          "desk",
          "стол",
          "рабочее место",
          "workspace",
          "фиксированное",
        ];

        if (equipmentKeywords.some((k) => n.includes(k))) return true;
        if (workspaceKeywords.some((k) => n.includes(k))) return false;

        return false;
      });

      setEquipmentTypes(equipmentOnly);
    } catch (err) {
      console.error("Ошибка загрузки типов ресурсов", err);
      setEquipmentTypes([]);
    }
  };

  useEffect(() => {
    fetchBooking();
    fetchEquipmentTypes();
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // ===== ЦЕНА: ОСНОВНАЯ, ОБОРУДОВАНИЕ, ИТОГО =====

    // все детские брони-оборудование
    const childEquipment = useMemo(
      () =>
        (booking?.children || []).filter(
          (c) => c.booking_type === "equipment"
        ),
      [booking]
    );

    // оборудование, которое реально попадает в оплату
    const payableEquipment = useMemo(
      () =>
        childEquipment.filter(
          (c) => c.status === "active" || c.status === "conflicted"
        ),
      [childEquipment]
    );

    const mainPrice = useMemo(
      () => calculateBookingPrice(booking),
      [booking]
    );

    // сумма только по активному / конфликтному оборудованию
    const equipmentTotal = useMemo(
      () =>
        payableEquipment.reduce(
          (sum, child) => sum + calculateBookingPrice(child),
          0
        ),
      [payableEquipment]
    );

    const totalPrice = useMemo(
      () => mainPrice + equipmentTotal,
      [mainPrice, equipmentTotal]
    );


  // ===== ДЕЙСТВИЯ =====

  const handleAddEquipment = async (e) => {
    e.preventDefault();
    setEquipment2Error(null);
    setEquipmentSuccess(null);

    if (!equipmentTypeId) {
      setEquipment2Error("Выберите тип оборудования");
      return;
    }

    const qty = Number(equipmentQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setEquipment2Error("Количество должно быть положительным целым числом");
      return;
    }

    setAddingEquipment(true);
    try {
      await api.post(`/bookings/${bookingId}/add-equipment/`, {
        resource_type_id: Number(equipmentTypeId),
        quantity: qty,
      });

      setEquipmentSuccess("Оборудование успешно добавлено к этой брони");
      setEquipmentQuantity(1);
      await fetchBooking(); // после этого суммы пересчитаются автоматически
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setEquipment2Error(
          `Не удалось добавить оборудование: ${JSON.stringify(
            err.response.data
          )}`
        );
      } else {
        setEquipment2Error("Не удалось добавить оборудование");
      }
    } finally {
      setAddingEquipment(false);
    }
  };

  const handleCancelEquipment = async (childBookingId) => {
    if (
      !window.confirm(
        "Вы действительно хотите удалить это оборудование из бронирования?"
      )
    ) {
      return;
    }

    setEquipment1Error(null);
    setEquipmentSuccess(null);
    setEquipmentActionLoading(true);

    try {
      await api.post(`/bookings/${childBookingId}/cancel/`);
      setEquipmentSuccess("Оборудование удалено (бронь по нему отменена).");
      await fetchBooking();
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setEquipment1Error(
          `Не удалось удалить оборудование: ${JSON.stringify(
            err.response.data
          )}`
        );
      } else {
        setEquipment1Error("Не удалось удалить оборудование");
      }
    } finally {
      setEquipmentActionLoading(false);
    }
  };

  const handleCancelMainBooking = async () => {
    if (!window.confirm("Вы действительно хотите отменить это бронирование?")) {
      return;
    }

    try {
      await api.post(`/bookings/${booking.id}/cancel/`);
      await fetchBooking();
    } catch (err) {
      console.error(err);
      alert("Не удалось отменить бронирование");
    }
  };

  const handleGoToExtend = () => {
    if (!booking) return;
    navigate(`/bookings/${booking.id}/extend`);
  };

  const handleGoToChange = () => {
    if (!booking) return;
    navigate(`/my-bookings/${booking.id}/change`);
  };

  const handleGoToEquipmentBookingShortcut = () => {
    if (!booking) return;

    const startStr = booking.start_datetime;
    const endStr = booking.end_datetime;

    const date = startStr.slice(0, 10);
    const from = startStr.slice(11, 16);
    const to = endStr.slice(11, 16);

    const params = new URLSearchParams();
    params.set("bookingId", String(booking.id));
    params.set("date", date);
    params.set("from", from);
    params.set("to", to);

    navigate(`/bookings/equipment?${params.toString()}`);
  };

  const handleGoToPayment = () => {
    if (!booking) return;
    // ВАЖНО: абсолютный путь с ведущим слэшем
    navigate(`/payment/booking/${booking.id}`);
  };

  // ===== МОДАЛКА "Пожаловаться" =====

  const openIssueModal = () => {
    setIssueDescription("");
    setIssueErrorMessage(null);
    setIssueSuccessMessage(null);
    setIssueModalOpen(true);
  };

  const closeIssueModal = () => {
    setIssueModalOpen(false);
    setIssueDescription("");
    setIssueErrorMessage(null);
    setIssueSuccessMessage(null);
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();

    if (!booking) return;

    if (!issueDescription.trim()) {
      setIssueErrorMessage("Пожалуйста, опишите проблему");
      return;
    }

    setIssueLoading(true);
    setIssueErrorMessage(null);
    setIssueSuccessMessage(null);

    try {
      const resp = await api.post("/issues/", {
        issue_type: booking.booking_type || "workspace",
        booking_id: booking.id,
        description: issueDescription.trim(),
      });

      console.log("ISSUE CREATED:", resp.data);
      setIssueSuccessMessage("Обращение отправлено");
      await fetchIssues();

      setTimeout(() => {
        closeIssueModal();
      }, 300);
    } catch (err) {
      console.error(err);
      setIssueErrorMessage("Не удалось отправить обращение");
    } finally {
      setIssueLoading(false);
    }
  };

  // ===== РЕНДЕР =====

  if (loading) {
    return (
      <div className="booking-detail-page">
        <div className="booking-detail-container">
          <h2 className="booking-detail-title">Карточка бронирования</h2>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="booking-detail-page">
        <div className="booking-detail-container">
          <h2 className="booking-detail-title">Карточка бронирования</h2>
          {error && <p style={{ color: "red" }}>{error}</p>}
          {!booking && !error && <p>Бронирование не найдено.</p>}
          <button className="booking-btn" onClick={() => navigate(-1)}>
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  const canShowExtendButton =
    booking.status === "active" && booking.booking_type === "workspace";

  const canShowChangeButton = booking.status === "conflicted";

  const canCancelMainBooking =
    booking.status === "active" && booking.booking_type === "workspace";

  const parentActiveAndNotFinished =
    booking.booking_type === "workspace" &&
    booking.status === "active" &&
    new Date(booking.end_datetime) > new Date();

  const canPay = booking.status === "active";

  return (
    <div className="booking-detail-page">
      <div className="booking-detail-container">
        <h2 className="booking-detail-title">
          Карточка бронирования #{booking.id}
        </h2>

        {/* Основная бронь */}
        <div className="booking-card">
          <div className="booking-card-header">
            <h3 className="booking-card-title">Основная бронь</h3>
          </div>

          <div className="booking-main-info">
            <div className="booking-main-row">
              <span className="booking-main-label">Ресурс:</span>
              <span className="booking-main-value">
                {booking.resource?.name || `#${booking.resource?.id ?? "-"}`}
              </span>
            </div>

            <div className="booking-main-row">
              <span className="booking-main-label">Тип бронирования:</span>
              <span className="booking-main-value">
                {booking.booking_type}
              </span>
            </div>

            <div className="booking-main-row">
              <span className="booking-main-label">Формат времени:</span>
              <span className="booking-main-value">
                {booking.time_format}
              </span>
            </div>

            <div className="booking-main-row">
              <span className="booking-main-label">Период:</span>
              <span className="booking-main-value">
                {formatDateTime(booking.start_datetime)} —{" "}
                {formatDateTime(booking.end_datetime)}
              </span>
            </div>

            <div className="booking-main-row">
              <span className="booking-main-label">Статус:</span>
              <span className="booking-main-value booking-main-status">
                {formatStatus(booking.status)}
              </span>
            </div>

            {/* 💰 Стоимость основной брони */}
            <div className="booking-main-row">
              <span className="booking-main-label">Стоимость рабочего места:</span>
              <span className="booking-main-value">
                {formatMoney(mainPrice)}
              </span>
            </div>
          </div>

          <div className="booking-main-actions">
            {canShowExtendButton && (
              <button
                type="button"
                className="booking-btn"
                onClick={handleGoToExtend}
              >
                Продлить бронирование
              </button>
            )}

            {canShowChangeButton && (
              <button
                type="button"
                className="booking-btn booking-btn-secondary"
                onClick={handleGoToChange}
              >
                Изменения в бронировании
              </button>
            )}

            {canCancelMainBooking && (
              <button
                type="button"
                className="booking-btn booking-btn-danger"
                onClick={handleCancelMainBooking}
              >
                Отменить бронирование
              </button>
            )}

            {/* Кнопка оплаты */}
            {canPay && (
            <button
              type="button"
              className="booking-btn booking-btn-pay"
              onClick={handleGoToPayment}
            >
              Оплатить ({formatMoney(totalPrice)})
            </button>
          )}
          </div>
        </div>

        {/* Обращения по этой брони */}
        <div className="booking-card">
          <div className="booking-card-header">
            <h3 className="booking-card-title">Обращения по этой брони</h3>
            <button
              type="button"
              className="booking-btn booking-btn-secondary"
              onClick={openIssueModal}
            >
              Пожаловаться
            </button>
          </div>

          {issuesLoading && <p>Загрузка обращений...</p>}
          {issuesError && (
            <p className="booking-alert-error">{issuesError}</p>
          )}

          {!issuesLoading && !issuesError && issues.length === 0 && (
            <p className="booking-muted">По этой брони нет обращений.</p>
          )}

          {!issuesLoading && !issuesError && issues.length > 0 && (
            <ul className="booking-issues-list">
              {issues.map((iss) => (
                <li key={iss.id} className="booking-issues-item">
                  <div>
                    <span className="issues-id">#{iss.id}</span>{" "}
                    <span className="issues-status">({iss.status})</span>
                  </div>
                  <div className="issues-text">
                    {iss.description.slice(0, 200)}
                    {iss.description.length > 200 ? "..." : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Оборудование по этой брони */}
        <div className="booking-card">
          <h3 className="booking-card-title">Оборудование по этой брони</h3>

          {childEquipment.length === 0 && (
            <p className="booking-muted">Оборудование пока не добавлено.</p>
          )}

          {childEquipment.length > 0 && (
            <>
              <table className="booking-equipment-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Оборудование</th>
                    <th>Период</th>
                    <th>Статус</th>
                    <th>Стоимость</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {childEquipment.map((c) => {
                    const canCancel =
                      c.status === "active" || c.status === "conflicted";
                    const canReplace =
                      parentActiveAndNotFinished &&
                      c.status === "conflicted";

                    const childPrice = calculateBookingPrice(c);

                    return (
                      <tr key={c.id}>
                        <td>{c.id}</td>
                        <td>
                          {c.resource?.name || `#${c.resource?.id ?? "-"}`}
                        </td>
                        <td>
                          {formatDateTime(c.start_datetime)} —{" "}
                          {formatDateTime(c.end_datetime)}
                        </td>
                        <td>{formatStatus(c.status)}</td>
                        <td>{formatMoney(childPrice)}</td>
                        <td className="booking-equipment-actions">
                          {canCancel ? (
                            <>
                              <button
                                type="button"
                                className="booking-btn booking-btn-secondary"
                                onClick={() => handleCancelEquipment(c.id)}
                                disabled={equipmentActionLoading}
                              >
                                {equipmentActionLoading
                                  ? "Обновление..."
                                  : "Удалить"}
                              </button>
                              {canReplace && (
                                <button
                                  type="button"
                                  className="booking-btn"
                                  style={{ marginLeft: 8 }}
                                  onClick={
                                    handleGoToEquipmentBookingShortcut
                                  }
                                >
                                  Заменить
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="booking-muted">
                              Нельзя изменить
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Итог по оборудованию */}
              <p className="booking-total-line">
                <strong>Сумма по оборудованию:</strong>{" "}
                {formatMoney(equipmentTotal)}
              </p>
            </>
          )}

          {equipment1Error && (
            <p className="booking-alert-error">{equipment1Error}</p>
          )}

          {equipmentSuccess && (
            <p className="booking-alert-success">{equipmentSuccess}</p>
          )}
        </div>

        {/* Форма добавления оборудования */}
        <div className="booking-card">
          <h3 className="booking-card-title">
            Добавить оборудование к этой брони
          </h3>

          {equipmentTypes.length === 0 && (
            <p className="booking-muted">
              Список типов оборудования пуст или не удалось его загрузить.
              Проверьте настройки типов ресурсов.
            </p>
          )}

          {equipmentTypes.length > 0 && (
            <form onSubmit={handleAddEquipment} className="booking-eq-form">
              <div className="booking-eq-row">
                <label className="booking-eq-label">
                  Тип оборудования
                  <select
                    value={equipmentTypeId}
                    onChange={(e) => setEquipmentTypeId(e.target.value)}
                    className="booking-eq-select"
                  >
                    <option value="">— выберите —</option>
                    {equipmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || `Тип #${t.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="booking-eq-row">
                <label className="booking-eq-label">
                  Количество
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={equipmentQuantity}
                    onChange={(e) => setEquipmentQuantity(e.target.value)}
                    className="booking-eq-input"
                  />
                </label>
              </div>

              {equipment2Error && (
                <p className="booking-alert-error">{equipment2Error}</p>
              )}
              {equipmentSuccess && (
                <p className="booking-alert-success">{equipmentSuccess}</p>
              )}

              <button
                type="submit"
                className="booking-btn"
                disabled={addingEquipment}
              >
                {addingEquipment
                  ? "Добавляем оборудование..."
                  : "Добавить оборудование"}
              </button>
            </form>
          )}

          <p className="booking-muted booking-eq-hint">
            Оборудование добавляется на весь период бронирования. Бэкенд сам
            проверит наличие свободных ресурсов и вернёт ошибку, если устройств
            не хватает.
          </p>
        </div>

        {/* Итог по брони */}
        <div className="booking-card">
          <h3 className="booking-card-title">Итого по бронированию</h3>
          <p className="booking-total-line">
            <strong>Рабочее место:</strong> {formatMoney(mainPrice)}
          </p>
          <p className="booking-total-line">
            <strong>Оборудование:</strong> {formatMoney(equipmentTotal)}
          </p>
          <p className="booking-total-line booking-total-line-bold">
            <strong>Всего к оплате:</strong> {formatMoney(totalPrice)}
          </p>
        </div>

        <button
          className="booking-btn booking-btn-ghost"
          onClick={() => navigate(-1)}
        >
          ← Назад
        </button>

        {/* Модалка "Пожаловаться" */}
        {issueModalOpen && (
          <div className="booking-modal-overlay">
            <div className="booking-modal">
              <h3 className="booking-modal-title">
                Сообщить о проблеме по бронированию #{booking.id}
              </h3>

              <form onSubmit={handleIssueSubmit}>
                <div className="booking-modal-field">
                  <label className="booking-modal-label">
                    Описание проблемы
                  </label>
                  <textarea
                    rows={4}
                    className="booking-modal-textarea"
                    value={issueDescription}
                    onChange={(e) =>
                      setIssueDescription(e.target.value)
                    }
                    placeholder="Опишите, что случилось"
                  />
                </div>

                {issueErrorMessage && (
                  <p className="booking-alert-error">{issueErrorMessage}</p>
                )}
                {issueSuccessMessage && (
                  <p className="booking-alert-success">
                    {issueSuccessMessage}
                  </p>
                )}

                <div className="booking-modal-actions">
                  <button
                    type="submit"
                    className="booking-btn"
                    disabled={issueLoading}
                  >
                    {issueLoading ? "Отправляем..." : "Отправить"}
                  </button>
                  <button
                    type="button"
                    className="booking-btn booking-btn-secondary"
                    onClick={closeIssueModal}
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

export default BookingDetailPage;
