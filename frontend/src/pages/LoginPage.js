// src/pages/LoginPage.js
import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../AuthContext";
import api from "../api"; // твой axios-инстанс
import "../styles/AuthPage.css";

const LoginPage = () => {
  const { login, isAuthenticated, isAdmin } = useContext(AuthContext);
  const navigate = useNavigate();

  const [mode, setMode] = useState("login"); // "login" | "register"

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(""); // для регистрации
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState(""); // подтверждение пароля в регистрации

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // если уже залогинен — сразу уводим
  useEffect(() => {
    if (isAuthenticated) {
      navigate(isAdmin ? "/admin/bookings" : "/bookings");
    }
  }, [isAuthenticated, isAdmin, navigate]);

  const handleLogin = async () => {
    await login(username, password);
    // редирект сделает useEffect
  };

  const handleRegister = async () => {
    if (!username || !password) {
      throw new Error("Укажите логин и пароль");
    }
    if (!email) {
      throw new Error("Укажите email");
    }
    if (password.length < 8) {
      throw new Error("Пароль должен быть не короче 8 символов");
    }
    if (password !== password2) {
      throw new Error("Пароли не совпадают");
    }

    await api.post("/auth/register/", {
      username,
      email,          // теперь точно не null
      password,
    });

    await login(username, password);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await handleLogin();
      } else {
        await handleRegister();
      }
    } catch (err) {
      console.error(err);
      // если бэкенд вернул сообщение
      const backendError =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.message ||
        "Ошибка сервера";
      setError(backendError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h2 className="auth-title">Личный кабинет коворкинга</h2>
          <p className="auth-subtitle">
            Войдите, чтобы управлять бронями и профилем.
          </p>
        </div>

        {/* Вкладки Вход / Регистрация */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
          >
            Вход
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">Логин</label>
            <input
              type="text"
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required={mode === "register"}
              />
            </div>
          )}


          <div className="auth-field">
            <label className="auth-label">Пароль</label>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label">Повторите пароль</label>
              <input
                type="password"
                className="auth-input"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading
              ? mode === "login"
                ? "Входим..."
                : "Регистрируем..."
              : mode === "login"
              ? "Войти"
              : "Зарегистрироваться"}
          </button>

          {mode === "login" && (
            <p className="auth-hint">
              Нет аккаунта?{" "}
              <button
                type="button"
                className="auth-hint-link"
                onClick={() => setMode("register")}
              >
                Зарегистрироваться
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
