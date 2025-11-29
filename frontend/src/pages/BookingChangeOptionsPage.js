// src/pages/BookingChangeOptionsPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";

const BookingChangeOptionsPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [data, setData] = useState(null); // ответ change-options

  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applySuccess, setApplySuccess] = useState(null);

  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    const fetchOptions = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const resp = await api.get(`/bookings/${bookingId}/change-options/`);
        setData(resp.data);
      } catch (err) {
        console.error(err);
        setLoadError("Не удалось загрузить варианты изменения бронирования.");
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, [bookingId]);

  const formatDateTime = (iso) => {
    if (!iso) return "";
    // сервер отдаёт ISO с таймзоной — аккуратно обрежем
    return iso.replace("T", " ").substring(0, 16);
  };

  const handleApply = async (resourceId) => {
    setApplyError(null);
    setApplySuccess(null);
    setApplyLoading(true);

    try {
        const resp = await api.post(`/bookings/${bookingId}/apply-change/`, {
        mode: "accept_new",
        resource_id: resourceId,
        });
        setApplySuccess("Изменения применены. Бронирование обновлено.");
        setTimeout(() => navigate(`/my-bookings/${bookingId}`), 800);
    } catch (err) {
        // ...
    } finally {
        setApplyLoading(false);
    }
    };

  const handleCancelBooking = async () => {
    if (!window.confirm("Вы действительно хотите отменить эту бронь?")) return;

    setCancelError(null);
    setCancelLoading(true);
    try {
      await api.post(`/bookings/${bookingId}/cancel/`);
      // после отмены — в список моих броней
      navigate("/profile/bookings");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.detail) {
        setCancelError(err.response.data.detail);
      } else {
        setCancelError("Не удалось отменить бронирование.");
      }
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 10px" }}>
        <h2>Изменение бронирования #{bookingId}</h2>
        <p>Загрузка вариантов...</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 10px" }}>
        <h2>Изменение бронирования #{bookingId}</h2>
        {loadError && <p style={{ color: "red" }}>{loadError}</p>}
        {!data && !loadError && <p>Данные не найдены.</p>}
        <button onClick={() => navigate(-1)}>← Назад</button>
      </div>
    );
  }

  const { has_options, options, period_start, period_end, booking_type } = data;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 10px" }}>
      <h2>Изменение бронирования #{bookingId}</h2>

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
          По вашей заявке бронирование было отмечено как проблемное (тип:{" "}
          <strong>
            {booking_type === "workspace"
              ? "рабочее место"
              : booking_type === "equipment"
              ? "оборудование"
              : booking_type}
          </strong>
          ).
        </p>
        <p>
          <strong>Период, на который подбираем замену:</strong>{" "}
          {formatDateTime(period_start)} — {formatDateTime(period_end)}
        </p>
      </div>

      {has_options ? (
        <>
          <h3>Доступные варианты</h3>
          <p style={{ marginTop: 0, marginBottom: 8 }}>
            Выберите ресурс, на который вы согласны перенести бронирование.
          </p>

          <ul style={{ paddingLeft: 18 }}>
            {options.map((opt) => (
              <li key={opt.resource_id} style={{ marginBottom: 6 }}>
                <strong>{opt.resource_name}</strong>{" "}
                <span style={{ color: "#666" }}>(ID: {opt.resource_id})</span>{" "}
                <button
                  style={{ marginLeft: 8 }}
                  type="button"
                  onClick={() => handleApply(opt.resource_id)}
                  disabled={applyLoading}
                >
                  {applyLoading ? "Применяем..." : "Выбрать"}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div
          style={{
            border: "1px solid #f0ad4e",
            background: "#fff3cd",
            padding: 12,
            borderRadius: 4,
            marginBottom: 16,
          }}
        >
          <strong>Система не нашла подходящих вариантов замены.</strong>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: "0.95em" }}>
            Вы можете отменить бронирование, если текущие условия вас не
            устраивают.
          </p>
        </div>
      )}

      {applyError && (
        <p style={{ color: "red", marginTop: 8 }}>{applyError}</p>
      )}
      {applySuccess && (
        <p style={{ color: "green", marginTop: 8 }}>{applySuccess}</p>
      )}
      {cancelError && (
        <p style={{ color: "red", marginTop: 8 }}>{cancelError}</p>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button type="button" onClick={() => navigate(-1)}>
          ← Назад
        </button>
        <button
          type="button"
          onClick={handleCancelBooking}
          disabled={cancelLoading}
        >
          {cancelLoading ? "Отменяем..." : "Отменить бронирование"}
        </button>
      </div>
    </div>
  );
};

export default BookingChangeOptionsPage;
