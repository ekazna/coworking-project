// src/pages/admin/AdminBookingDetailPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminBookingDetailPage.css";   // 👈 новый импорт

const AdminBookingDetailPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [parentBooking, setParentBooking] = useState(null);
  const [relatedIssues, setRelatedIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // ---------- загрузка бронирования + связанных данных ----------
  const fetchBooking = async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    setActionSuccess(null);
    setParentBooking(null);
    setRelatedIssues([]);
    setIssuesError(null);

    try {
      const resp = await api.get(`/bookings/${bookingId}/details/`);
      const data = resp.data;
      setBooking(data);

      if (data.booking_type === "equipment" && data.parent_booking) {
        let parentId =
          typeof data.parent_booking === "object"
            ? data.parent_booking.id
            : data.parent_booking;

        if (parentId) {
          try {
            const parentResp = await api.get(
              `/bookings/${parentId}/details/`
            );
            setParentBooking(parentResp.data);
          } catch (e) {
            console.error("Не удалось загрузить родительскую бронь", e);
          }
        }
      }

      setIssuesLoading(true);
      try {
        const issuesResp = await api.get("/issues/", {
          params: { booking: bookingId },
        });
        setRelatedIssues(issuesResp.data || []);
      } catch (e) {
        console.error("Ошибка загрузки связанных обращений", e);
        setIssuesError("Не удалось загрузить обращения по этой броне.");
      } finally {
        setIssuesLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить данные бронирования.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // ---------- форматирование ----------
  const formatDateTime = (dt) => (dt ? dt.replace("T", " ").slice(0, 16) : "");

  const formatBookingType = (t) =>
    t === "workspace"
      ? "Рабочее место"
      : t === "equipment"
      ? "Оборудование"
      : t;

  const formatTimeFormat = (fmt) =>
    fmt === "hour"
      ? "часы"
      : fmt === "day"
      ? "дни"
      : fmt === "month"
      ? "месяц"
      : fmt;

  const formatStatus = (s) =>
    s === "active"
      ? "активна"
      : s === "completed"
      ? "завершена"
      : ["cancelled", "canceled"].includes(s)
      ? "отменена"
      : s === "conflicted"
      ? "конфликт"
      : s;

  const formatIssueStatus = (s) => {
    switch (s) {
      case "new":
        return "Новая";
      case "confirmed":
        return "Подтверждена";
      case "resolved":
        return "Решена";
      case "rejected":
        return "Отклонена";
      default:
        return s || "";
    }
  };

  const formatIssueType = (t) => {
    switch (t) {
      case "workspace":
        return "Рабочее место";
      case "equipment":
        return "Оборудование";
      default:
        return t || "";
    }
  };

  // ---------- отмена ----------
  const handleCancelMain = async () => {
    if (!window.confirm("Отменить бронирование?")) return;

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await api.post(`/bookings/${booking.id}/cancel/`);
      setActionSuccess("Бронирование отменено.");
      fetchBooking();
    } catch (err) {
      console.error(err);
      setActionError("Ошибка при отмене.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelChild = async (childId) => {
    if (!window.confirm("Отменить оборудование?")) return;

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await api.post(`/bookings/${childId}/cancel/`);
      setActionSuccess("Оборудование отменено.");
      fetchBooking();
    } catch (err) {
      console.error(err);
      setActionError("Ошибка при отмене оборудования.");
    } finally {
      setActionLoading(false);
    }
  };

  // ---------- рендер ----------
  if (loading) {
    return (
      <div className="admin-booking-page">
        <div className="admin-booking-container">
          <p className="admin-muted">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="admin-booking-page">
        <div className="admin-booking-container">
          <h2 className="admin-booking-title">Бронирование #{bookingId}</h2>
          <div className="admin-alert-error">{error || "Бронирование не найдено."}</div>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => navigate(-1)}
          >
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  const user = booking.user || {};
  const equipmentChildren = (booking.children || []).filter(
    (c) => c.booking_type === "equipment"
  );
  const isEquipmentBooking = booking.booking_type === "equipment";

  const resource = booking.resource || null;
  const resourceId = resource?.id;

  const renderStatusBadge = (status) => (
    <span className={`booking-status booking-status-${status}`}>
      {formatStatus(status)}
    </span>
  );

  return (
    <div className="admin-booking-page">
      <div className="admin-booking-container">
        <div className="admin-booking-header">
          <h2 className="admin-booking-title">
            Бронирование #{booking.id}
          </h2>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => navigate(-1)}
          >
            ← Назад
          </button>
        </div>

        {actionError && (
          <div className="admin-alert-error">{actionError}</div>
        )}
        {actionSuccess && (
          <div className="admin-alert-success">{actionSuccess}</div>
        )}

        {/* Основная информация */}
        <div className="admin-card">
          <h3 className="admin-section-title">Основная информация</h3>

          <div className="admin-booking-main-grid">
            <div className="admin-booking-main-col">
              <div className="admin-field-row">
                <span className="admin-field-label">Клиент</span>
                <span className="admin-field-value">
                  {user.id ? (
                    <Link
                      to={`/admin/clients/${user.id}`}
                      className="admin-link"
                    >
                      {user.username || user.email || "—"}
                    </Link>
                  ) : (
                    user.username || user.email || "—"
                  )}
                </span>
              </div>

              <div className="admin-field-row">
                <span className="admin-field-label">Тип бронирования</span>
                <span className="admin-field-value">
                  {formatBookingType(booking.booking_type)}
                </span>
              </div>

              <div className="admin-field-row">
                <span className="admin-field-label">Формат времени</span>
                <span className="admin-field-value">
                  {formatTimeFormat(booking.time_format)}
                </span>
              </div>
            </div>

            <div className="admin-booking-main-col">
              <div className="admin-field-row">
                <span className="admin-field-label">Период</span>
                <span className="admin-field-value">
                  {formatDateTime(booking.start_datetime)} —{" "}
                  {formatDateTime(booking.end_datetime)}
                </span>
              </div>

              <div className="admin-field-row">
                <span className="admin-field-label">Ресурс</span>
                <span className="admin-field-value">
                  {resourceId ? (
                    <button
                      type="button"
                      className="admin-chip-button"
                      onClick={() =>
                        navigate(`/admin/resources/${resourceId}`)
                      }
                    >
                      {resource.name || `#${resourceId}`}
                    </button>
                  ) : (
                    `#${resourceId ?? "—"}`
                  )}
                </span>
              </div>

              <div className="admin-field-row">
                <span className="admin-field-label">Статус</span>
                <span className="admin-field-value">
                  {renderStatusBadge(booking.status)}
                </span>
              </div>
            </div>
          </div>

          {(booking.status === "active" ||
            booking.status === "conflicted") && (
            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={handleCancelMain}
                disabled={actionLoading}
              >
                {actionLoading ? "Отменяем..." : "Отменить бронирование"}
              </button>
            </div>
          )}
        </div>

        {/* Основная бронь для equipment */}
        {isEquipmentBooking && parentBooking && (
          <div className="admin-card admin-card-muted">
            <h3 className="admin-section-title">
              Основная бронь рабочего места
            </h3>

            <div className="admin-booking-main-grid">
              <div className="admin-booking-main-col">
                <div className="admin-field-row">
                  <span className="admin-field-label">ID</span>
                  <span className="admin-field-value">
                    #{parentBooking.id}
                  </span>
                </div>
                <div className="admin-field-row">
                  <span className="admin-field-label">Ресурс</span>
                  <span className="admin-field-value">
                    {parentBooking.resource?.name ||
                      `#${parentBooking.resource?.id ?? "—"}`}
                  </span>
                </div>
              </div>

              <div className="admin-booking-main-col">
                <div className="admin-field-row">
                  <span className="admin-field-label">Период</span>
                  <span className="admin-field-value">
                    {formatDateTime(parentBooking.start_datetime)} —{" "}
                    {formatDateTime(parentBooking.end_datetime)}
                  </span>
                </div>
                <div className="admin-field-row">
                  <span className="admin-field-label">Статус</span>
                  <span className="admin-field-value">
                    {renderStatusBadge(parentBooking.status)}
                  </span>
                </div>
              </div>
            </div>

            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() =>
                  navigate(`/admin/bookings/${parentBooking.id}`)
                }
              >
                Открыть основную бронь
              </button>
            </div>
          </div>
        )}

        {/* Оборудование (для workspace-брони) */}
        {!isEquipmentBooking && (
          <div className="admin-card">
            <h3 className="admin-section-title">Оборудование по этой брони</h3>

            {equipmentChildren.length === 0 && (
              <p className="admin-muted">Нет добавленного оборудования.</p>
            )}

            {equipmentChildren.length > 0 && (
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Ресурс</th>
                      <th>Период</th>
                      <th>Статус</th>
                      <th className="admin-table-actions">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentChildren.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <button
                            type="button"
                            className="admin-chip-button"
                            onClick={() =>
                              navigate(`/admin/bookings/${c.id}`)
                            }
                          >
                            #{c.id}
                          </button>
                        </td>
                        <td>
                          {c.resource?.name ||
                            `#${c.resource?.id ?? "—"}`}
                        </td>
                        <td>
                          {formatDateTime(c.start_datetime)} —{" "}
                          {formatDateTime(c.end_datetime)}
                        </td>
                        <td>{renderStatusBadge(c.status)}</td>
                        <td className="admin-table-actions">
                          {(c.status === "active" ||
                            c.status === "conflicted") && (
                            <button
                              type="button"
                              className="admin-btn admin-btn-small admin-btn-danger"
                              onClick={() => handleCancelChild(c.id)}
                            >
                              Отменить
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Обращения по этой брони */}
        <div className="admin-card">
          <h3 className="admin-section-title">Обращения по этой брони</h3>

          {issuesLoading && (
            <p className="admin-muted">Загрузка обращений...</p>
          )}
          {issuesError && (
            <div className="admin-alert-error">{issuesError}</div>
          )}

          {!issuesLoading &&
            !issuesError &&
            relatedIssues.length === 0 && (
              <p className="admin-muted">По этой брони нет обращений.</p>
            )}

          {!issuesLoading &&
            !issuesError &&
            relatedIssues.length > 0 && (
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Тип</th>
                      <th>Статус</th>
                      <th>Описание</th>
                      <th className="admin-table-actions">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedIssues.map((iss) => (
                      <tr key={iss.id}>
                        <td>#{iss.id}</td>
                        <td>{formatIssueType(iss.issue_type)}</td>
                        <td>{formatIssueStatus(iss.status)}</td>
                        <td className="admin-issue-desc-cell" title={iss.description || ""}>
                          {iss.description || "—"}
                        </td>
                        <td className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-small"
                            onClick={() =>
                              navigate(`/admin/issues/${iss.id}`)
                            }
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
    </div>
  );
};

export default AdminBookingDetailPage;
