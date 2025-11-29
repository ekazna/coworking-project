// src/pages/admin/AdminIssuesPage.js
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminIssuesPage.css";

const STATUS_LABELS = {
  new: "Новая",
  confirmed: "Подтверждена",
  resolved: "Решена",
  rejected: "Отклонена",
};

const ISSUE_TYPE_LABELS = {
  workspace: "Рабочее место",
  equipment: "Оборудование",
};

const AdminIssuesPage = () => {
  const navigate = useNavigate();

  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");

  // новые поля фильтра
  const [bookingSearch, setBookingSearch] = useState(""); // поиск по номеру брони
  const [loginSearch, setLoginSearch] = useState(""); // поиск по "Пользователь" (то, что видно в таблице)

  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      // если хочешь, можно эти параметры оставить — вдруг потом добавишь фильтрацию на бэке
      if (bookingSearch.trim()) {
        params.booking = bookingSearch.trim().replace("#", "");
      }

      if (loginSearch.trim()) {
        // просто пробрасываем, но основная логика поиска — на фронте
        params.search = loginSearch.trim();
      }

      const response = await api.get("/issues/", { params });
      setIssues(response.data || []);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить список заявок");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleOpenIssue = (issue) => {
    navigate(`/admin/issues/${issue.id}`);
  };

  const renderStatusBadge = (status) => {
    const label = STATUS_LABELS[status] || status || "—";
    return (
      <span className={`issue-status issue-status-${status}`}>{label}</span>
    );
  };

  const renderTypeBadge = (type) => {
    const label = ISSUE_TYPE_LABELS[type] || type || "—";
    return <span className="issue-type-badge">{label}</span>;
  };

  // Берём юзера либо из issue.user, либо из booking.user
  const getRawUser = (issue) => {
    if (issue.user) return issue.user;
    if (issue.booking && issue.booking.user) return issue.booking.user;
    return null;
  };

  // ОДИН хелпер — то, что реально показывается в колонке "Пользователь"
  const getUserDisplay = (issue) => {
    const u = getRawUser(issue);
    if (!u) return "—";

    const parts = [];

    if (u.username) {
      parts.push(u.username);
    }

    if (u.first_name || u.last_name) {
      const fullName = `${u.first_name || ""} ${u.last_name || ""}`.trim();
      if (fullName) {
        parts.push(fullName);
      }
    }

    if (u.email) {
      parts.push(`<${u.email}>`);
    }

    if (!parts.length) return "—";
    return parts.join(" ");
  };

  const getBookingId = (issue) => {
    if (!issue.booking) return null;
    if (typeof issue.booking === "object") {
      return issue.booking.id;
    }
    return issue.booking;
  };

  const getBookingLabel = (issue) => {
    const id = getBookingId(issue);
    if (!id) return "—";
    return `#${id}`;
  };

  const getResourceLabel = (issue) => {
    if (!issue.resource) return "—";
    if (typeof issue.resource === "object") {
      return issue.resource.name
        ? `${issue.resource.name} (#${issue.resource.id})`
        : `#${issue.resource.id}`;
    }
    return `#${issue.resource}`;
  };

  const shortText = (text, max = 80) => {
    if (!text) return "";
    if (text.length <= max) return text;
    return text.slice(0, max) + "…";
  };

  // Локальная фильтрация: номер брони + то, что реально видно в колонке "Пользователь"
  const filteredIssues = useMemo(() => {
    const bookingQuery = bookingSearch.trim().replace("#", "");
    const loginQuery = loginSearch.trim().toLowerCase();

    return issues.filter((issue) => {
      let ok = true;

      if (bookingQuery) {
        const bId = getBookingId(issue);
        if (!bId || !String(bId).includes(bookingQuery)) {
          ok = false;
        }
      }

      if (ok && loginQuery) {
        const display = getUserDisplay(issue).toLowerCase();
        if (!display.includes(loginQuery)) {
          ok = false;
        }
      }

      return ok;
    });
  }, [issues, bookingSearch, loginSearch]);

  // чтобы можно было жать Enter в полях поиска
  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      fetchIssues();
    }
  };

  return (
    <div className="admin-issues-page">
      <div className="admin-issues-container">
        <h2 className="admin-issues-title">Заявки о поломках</h2>

        {/* Фильтры */}
        <div className="admin-issues-filters">
          <div className="admin-issues-filters-row">
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Все</option>
              <option value="new">Новые</option>
              <option value="confirmed">Подтвержденные</option>
              <option value="resolved">Решенные</option>
              <option value="rejected">Отклоненные</option>
            </select>

            <button
              type="button"
              onClick={fetchIssues}
              className="admin-btn admin-btn-secondary"
              disabled={loading}
            >
              {loading ? "Обновляем..." : "Обновить"}
            </button>
          </div>

          {/* Поиск по номеру брони и по значению в колонке "Пользователь" */}
          <div className="admin-issues-filters-row">
            <input
              type="text"
              className="admin-input"
              placeholder="Поиск по номеру брони (#123)"
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Поиск по полю «Пользователь»"
              value={loginSearch}
              onChange={(e) => setLoginSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>

          {error && <p className="admin-alert-error">{error}</p>}
        </div>

        {loading && <p className="admin-muted">Загрузка заявок...</p>}

        {/* Таблица заявок */}
        {!loading && filteredIssues.length === 0 ? (
          <p className="admin-muted">Заявки не найдены по текущему фильтру.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Пользователь</th>
                  <th>Бронь</th>
                  <th>Ресурс</th>
                  <th>Описание</th>
                  <th className="admin-table-actions">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td>{issue.id}</td>
                    <td>{renderTypeBadge(issue.issue_type)}</td>
                    <td>{renderStatusBadge(issue.status)}</td>
                    <td>{getUserDisplay(issue)}</td>
                    <td>{getBookingLabel(issue)}</td>
                    <td>{getResourceLabel(issue)}</td>
                    <td className="issue-desc-cell">
                      <span title={issue.description}>
                        {shortText(issue.description)}
                      </span>
                    </td>
                    <td className="admin-table-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn-small"
                        onClick={() => handleOpenIssue(issue)}
                      >
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminIssuesPage;
