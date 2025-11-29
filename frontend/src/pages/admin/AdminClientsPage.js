// src/pages/admin/AdminClientsPage.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminClientsPage.css";

const AdminClientsPage = () => {
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/admin/users/");
      setClients(response.data);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить список клиентов");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const filteredClients = clients.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const openClientCard = (userId) => {
    navigate(`/admin/clients/${userId}`);
  };

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <div>
            <h2 className="admin-title">Клиенты</h2>
            <p className="admin-subtitle">
              Управление аккаунтами пользователей коворкинга.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={fetchClients}
            disabled={loading}
          >
            {loading ? "Обновляем..." : "Обновить список"}
          </button>
        </div>

        {error && <p className="alert-error">{error}</p>}

        {/* Фильтр / поиск */}
        <div className="admin-filter-card">
          <div className="admin-filter-field">
            <label className="admin-filter-label">
              Поиск по логину или email
            </label>
            <input
              type="text"
              className="admin-filter-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Начните вводить логин или email"
            />
          </div>
        </div>

        {/* Таблица клиентов */}
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Имя / Фамилия</th>
                <th>Роль</th>
                <th>Активен</th>
                <th>Дата регистрации</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="admin-table-empty">
                    Загрузка...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-table-empty">
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                filteredClients.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.email || "—"}</td>
                    <td>
                      {(u.first_name || "") +
                        (u.last_name ? ` ${u.last_name}` : "")}
                    </td>
                    <td>
                      <span
                        className={
                          u.is_staff
                            ? "badge badge-role-admin"
                            : "badge badge-role-client"
                        }
                      >
                        {u.is_staff ? "Администратор" : "Клиент"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          u.is_active
                            ? "badge badge-active"
                            : "badge badge-inactive"
                        }
                      >
                        {u.is_active ? "Да" : "Нет"}
                      </span>
                    </td>
                    <td>
                      {u.date_joined
                        ? u.date_joined.replace("T", " ").slice(0, 16)
                        : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-small"
                        onClick={() => openClientCard(u.id)}
                      >
                        Карточка клиента
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminClientsPage;
