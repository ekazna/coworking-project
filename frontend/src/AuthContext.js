// src/AuthContext.js
import React, { createContext, useState, useEffect } from "react";
import api from "./api";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // токен хранится как простая строка
  const [token, setToken] = useState(() => {
    return localStorage.getItem("authToken") || null;
  });

  // пользователь (username + isAdmin) храним как JSON
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("authUser");
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      // лёгкая валидация структуры
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.username === "string"
      ) {
        return parsed;
      }
    } catch (e) {
      console.warn("Не удалось распарсить authUser из localStorage:", e);
    }

    // если там мусор — удаляем и считаем, что не залогинен
    localStorage.removeItem("authUser");
    return null;
  });

  // если токена нет — гарантирую, что user = null
  useEffect(() => {
    if (!token) {
      setUser(null);
      localStorage.removeItem("authUser");
    }
  }, [token]);

  const login = async (username, password) => {
    const response = await api.post("/auth/login/", { username, password });

    // backend LoginView теперь возвращает:
    // { token, username, is_staff }
    const { token: newToken, username: name, is_staff } = response.data;

    const userData = {
      username: name,
      isAdmin: !!is_staff,
    };

    localStorage.setItem("authToken", newToken);
    localStorage.setItem("authUser", JSON.stringify(userData));

    setToken(newToken);
    setUser(userData);

    return response.data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout/");
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    setToken(null);
    setUser(null);
  };

  const value = {
    token,
    user,
    isAuthenticated: !!token && !!user,
    isAdmin: !!user?.isAdmin,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
