// src/pages/NotificationsPage.js
import React, { useEffect, useState, useContext } from "react";
import api from "../api";
import { AuthContext } from "../AuthContext";
import { useNavigate } from "react-router-dom";

const NotificationsPage = () => {
  const { isAuthenticated, isAdmin } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (isAdmin) {
      // потом можно сделать отдельную админ-страницу
    }

    const fetchData = async () => {
      const response = await api.get("/notifications/");
      setNotifications(response.data);
    };

    fetchData();
  }, [isAuthenticated, isAdmin, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h2>Уведомления</h2>
      {notifications.length === 0 ? (
        <p>У вас пока нет уведомлений.</p>
      ) : (
        <ul>
          {notifications.map((n) => (
            <li key={n.id} style={{ marginBottom: 12 }}>
              <strong>{n.title}</strong>
              <br />
              <span>{n.message}</span>
              <br />
              <small>{n.created_at}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NotificationsPage;
