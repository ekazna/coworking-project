// src/pages/BookingChangePage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";

const BookingChangePage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [cancelSuccess, setCancelSuccess] = useState(null);

  const fetchBooking = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get(`/bookings/${bookingId}/details/`);
      setBooking(resp.data);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить данные о бронировании.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const formatDateTime = (dt) => {
    if (!dt) return "";
    return dt.replace("T", " ").slice(0, 16);
  };

  const handleCancelBooking = async () => {
    if (
      !window.confirm(
        "Вы уверены, что хотите отменить бронирование в связи с поломкой ресурса?"
      )
    ) {
      return;
    }

    setCancelLoading(true);
    setCancelError(null);
    setCancelSuccess(null);

    try {
      await api.post(`/bookings/${bookingId}/cancel/`);
      setCancelSuccess("Бронирование отменено.");
      // можно вернуть на список броней
      setTimeout(() => {
        navigate("/profile/bookings");
      }, 800);
    } catch (err) {
      console.error(err);
      setCancelError("Не удалось отменить бронирование.");
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 10px" }}>
        <h2>Изменение бронирования</h2>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 10px" }}>
        <h2>Изменение бронирования</h2>
        {error && <p style={{ color: "red" }}>{error}</p>}
        {!booking && !error && <p>Бронирование не найдено.</p>}
        <button onClick={() => navigate(-1)}>← Назад</button>
      </div>
    );
  }

  const isWorkspace = booking.booking_type === "workspace";
  const isEquipment = booking.booking_type === "equipment";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 10px" }}>
      <h2>Изменение бронирования #{booking.id}</h2>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 4,
          padding: 16,
          marginTop: 10,
          marginBottom: 20,
          background: "#fafafa",
        }}
      >
        <p>
          Мы зафиксировали проблему с{" "}
          {isWorkspace
            ? "вашим рабочим местом"
            : isEquipment
            ? "оборудованием"
            : "ресурсом"}{" "}
          в этом бронировании.
        </p>
        <p>
          <strong>Ресурс:</strong>{" "}
          {booking.resource?.name || `#${booking.resource?.id ?? "-"}`}
        </p>
        <p>
          <strong>Период:</strong>{" "}
          {formatDateTime(booking.start_datetime)} —{" "}
          {formatDateTime(booking.end_datetime)}
        </p>

        <p style={{ marginTop: 12 }}>
          На следующем шаге здесь будут предлагаться варианты:
        </p>
        <ul>
          <li>
            Перебронировать на другое рабочее место / оборудование (при наличии
            доступного аналога).
          </li>
          <li>Либо отменить бронирование, если новый вариант вас не устроит.</li>
        </ul>

        <p style={{ marginTop: 10, fontSize: "0.9em", color: "#555" }}>
          Сейчас доступна только отмена бронирования из этой карточки.
        </p>

        {cancelError && (
          <p style={{ color: "red", marginTop: 8 }}>{cancelError}</p>
        )}
        {cancelSuccess && (
          <p style={{ color: "green", marginTop: 8 }}>{cancelSuccess}</p>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleCancelBooking}
            disabled={cancelLoading}
          >
            {cancelLoading ? "Отменяем..." : "Отменить бронирование"}
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            ← Назад
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingChangePage;
