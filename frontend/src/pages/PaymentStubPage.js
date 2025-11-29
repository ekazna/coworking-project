// src/pages/PaymentStubPage.js
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import "../styles/PaymentStubPage.css";

const PaymentStubPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="payment-page">
      <div className="payment-card">
        <h1 className="payment-title">Оплата бронирования</h1>
        <p className="payment-subtitle">
          Бронирование <span className="payment-booking-id">#{bookingId}</span>
        </p>

        <p className="payment-text">
          Здесь в реальном проекте будет подключён платёжный провайдер
          (ЮKassa, CloudPayments, СБП и т.п.). В рамках ВКР это страница-заглушка,
          которая демонстрирует точку входа в оплату.
        </p>

        <div className="payment-actions">
          <button
            type="button"
            className="payment-btn"
            onClick={() => navigate(-1)}
          >
            ← Вернуться к бронированию
          </button>
          <button
            type="button"
            className="payment-btn-secondary"
            onClick={() => navigate("/profile/bookings")}
          >
            Перейти к списку моих броней
          </button>
        </div>

        <p className="payment-note">
          * Оплата не производится. Страница используется для демонстрации
          бизнес-процесса в проекте.
        </p>
      </div>
    </div>
  );
};

export default PaymentStubPage;
