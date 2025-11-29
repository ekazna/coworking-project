// src/pages/admin/AdminClientDetailPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminClientDetailPage.css";

const AdminClientDetailPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);
  const [profileError, setProfileError] = useState(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");

  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(false);

  // валидации
  const validatePhone = (value) => {
    const v = (value || "").trim();
    if (!v) return null;
    const re = /^[0-9+\-\s()]{5,20}$/;
    if (!re.test(v)) {
      return "Некорректный телефон. Разрешены цифры, пробелы, +, -, ().";
    }
    return null;
  };

  const validateTelegram = (value) => {
    const v = (value || "").trim();
    if (!v) return null;
    const re = /^@[A-Za-z0-9_]{3,31}$/;
    if (!re.test(v)) {
      return "Некорректный Telegram username. Пример: @username_123.";
    }
    return null;
  };

  // загрузка клиента
  useEffect(() => {
    const fetchClient = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const resp = await api.get(`/users/${userId}/admin-detail/`);
        const data = resp.data || {};

        setUsername(data.username || "");
        setEmail(data.email || "");
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setPhone(data.phone || "");
        setTelegramUsername(data.telegram_username || "");
        setNotifyEmail(
          typeof data.notify_email === "boolean" ? data.notify_email : true
        );
        setNotifyTelegram(
          typeof data.notify_telegram === "boolean"
            ? data.notify_telegram
            : false
        );
      } catch (err) {
        console.error(err);
        setLoadError("Не удалось загрузить профиль клиента.");
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, [userId]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    if (!email.trim()) {
      setProfileError("Email обязателен.");
      return;
    }

    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setProfileError(phoneErr);
      return;
    }

    const tgErr = validateTelegram(telegramUsername);
    if (tgErr) {
      setProfileError(tgErr);
      return;
    }

    setSavingProfile(true);
    try {
      await api.put(`/users/${userId}/admin-detail/`, {
        email: email || "",
        first_name: firstName || "",
        last_name: lastName || "",
        phone: phone || "",
        telegram_username: telegramUsername || "",
        notify_email: notifyEmail,
        notify_telegram: notifyTelegram,
      });

      setProfileMessage("Изменения сохранены.");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.detail) {
        setProfileError(err.response.data.detail);
      } else {
        setProfileError("Не удалось сохранить профиль клиента.");
      }
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-client-page">
        <div className="admin-client-container">
          <div className="profile-card">
            <h2 className="admin-client-title">Клиент #{userId}</h2>
            <p>Загрузка...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-client-page">
        <div className="admin-client-container">
          <div className="profile-card">
            <h2 className="admin-client-title">Клиент #{userId}</h2>
            <p className="alert-error">{loadError}</p>
            <button
              type="button"
              className="btn btn-outline profile-back"
              onClick={() => navigate(-1)}
            >
              ← Назад
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-client-page">
      <div className="admin-client-container">
        <div className="admin-client-header">
          <div>
            <h2 className="admin-client-title">Профиль клиента</h2>
            <p className="admin-client-subtitle">
              ID: {userId} • Логин: <strong>{username}</strong>
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() =>
              navigate(
                `/admin/bookings?client=${encodeURIComponent(
                  username || email || userId
                )}`
              )
            }
          >
            Просмотреть брони клиента
          </button>
        </div>

        {/* Форма профиля */}
        <form onSubmit={handleProfileSubmit} className="profile-card profile-form">
          <h3 className="form-section-title">Основная информация</h3>

          <div className="form-field">
            <label className="form-label">Логин (нельзя изменить)</label>
            <input
              type="text"
              value={username}
              disabled
              className="form-input form-input-disabled"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Имя</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Фамилия</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <h3 className="form-section-title">Контакты</h3>

          <div className="form-field">
            <label className="form-label">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (999) 123-45-67"
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Telegram username</label>
            <input
              type="text"
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder="@username_123"
              className="form-input"
            />
            <div className="form-hint">
              Должен начинаться с @, можно использовать латинские буквы,
              цифры и подчёркивания.
            </div>
          </div>

          <h3 className="form-section-title">Уведомления</h3>

          <div className="check-row">
            <label className="check-label">
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
              />
              Получать уведомления на email
            </label>
          </div>

          <div className="check-row">
            <label className="check-label">
              <input
                type="checkbox"
                checked={notifyTelegram}
                onChange={(e) => setNotifyTelegram(e.target.checked)}
              />
              Получать уведомления в Telegram
            </label>
          </div>

          {profileError && <p className="alert-error">{profileError}</p>}
          {profileMessage && <p className="alert-success">{profileMessage}</p>}

          <button
            type="submit"
            className="btn btn-primary profile-submit"
            disabled={savingProfile}
          >
            {savingProfile ? "Сохраняем..." : "Сохранить изменения"}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-outline profile-back"
          onClick={() => navigate(-1)}
        >
          ← Назад
        </button>
      </div>
    </div>
  );
};

export default AdminClientDetailPage;
