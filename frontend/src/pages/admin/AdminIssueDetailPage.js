// src/pages/admin/AdminIssueDetailPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminIssueDetailPage.css";

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

const AdminIssueDetailPage = () => {
  const { issueId } = useParams();
  const navigate = useNavigate();

  const [issue, setIssue] = useState(null);
  const [booking, setBooking] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [confirmStart, setConfirmStart] = useState("");
  const [confirmEnd, setConfirmEnd] = useState("");
  const [selectedResourceIds, setSelectedResourceIds] = useState([]);

  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [confirmSuccess, setConfirmSuccess] = useState(null);

  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState(null);

  // сводка последнего подтверждения (что поменялось)
  const [impact, setImpact] = useState(null);

  const formatDateTime = (dt) => {
    if (!dt) return "";
    return dt.replace("T", " ").slice(0, 16);
  };

  const toLocalInputValue = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setConfirmError(null);
    setConfirmSuccess(null);
    setRejectError(null);
    setImpact(null);

    try {
      // 1) сама заявка
      const issueResp = await api.get(`/issues/${issueId}/`);
      const issueData = issueResp.data;
      setIssue(issueData);

      // дефолтные даты: created_at и +1 час
      let baseDate = null;
      if (issueData.created_at) {
        const d = new Date(issueData.created_at);
        if (!Number.isNaN(d.getTime())) {
          baseDate = d;
        }
      }
      if (!baseDate) {
        baseDate = new Date();
      }

      const plusHour = new Date(baseDate.getTime() + 60 * 60 * 1000);
      setConfirmStart(toLocalInputValue(baseDate));
      setConfirmEnd(toLocalInputValue(plusHour));

      // 2) бронирование
      if (issueData.booking) {
        const bookingResp = await api.get(
          `/bookings/${issueData.booking}/details/`
        );
        setBooking(bookingResp.data);
      } else {
        setBooking(null);
      }

      // 3) предзаполнить ресурсы
      const initialSelected = [];
      if (issueData.resource) {
        initialSelected.push(issueData.resource);
      }
      setSelectedResourceIds(initialSelected);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить данные заявки.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  const toggleResourceSelection = (resourceId) => {
    setSelectedResourceIds((prev) =>
      prev.includes(resourceId)
        ? prev.filter((id) => id !== resourceId)
        : [...prev, resourceId]
    );
  };

  const handleConfirmIssue = async () => {
    if (!issue) return;

    setConfirmError(null);
    setConfirmSuccess(null);
    setRejectError(null);
    setImpact(null);

    if (!confirmStart || !confirmEnd) {
      setConfirmError("Укажите начало и конец недоступности ресурса.");
      return;
    }

    if (!selectedResourceIds.length) {
      setConfirmError("Выберите хотя бы один ресурс для вывода из работы.");
      return;
    }

    setConfirmLoading(true);
    try {
      const payload = {
        start_datetime: confirmStart,
        end_datetime: confirmEnd,
        resource_ids: selectedResourceIds,
      };

      const resp = await api.post(`/issues/${issue.id}/confirm/`, payload);

      setConfirmSuccess(resp.data.detail || "Заявка подтверждена.");

      setImpact({
        autoReassigned: resp.data.auto_reassigned_bookings || [],
        conflicted: resp.data.conflicted_bookings || [],
        autoReassignedCount: resp.data.auto_reassigned_count || 0,
        conflictedCount: resp.data.conflicted_count || 0,
      });

      setIssue((prev) =>
        prev
          ? {
              ...prev,
              status: "confirmed",
            }
          : prev
      );
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setConfirmError(
          `Ошибка при подтверждении: ${JSON.stringify(err.response.data)}`
        );
      } else {
        setConfirmError("Не удалось подтвердить заявку.");
      }
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleRejectIssue = async () => {
    if (!issue) return;
    if (!window.confirm("Отклонить эту заявку о поломке?")) return;

    setRejectError(null);
    setConfirmError(null);
    setConfirmSuccess(null);
    setImpact(null);

    setRejectLoading(true);
    try {
      const resp = await api.post(`/issues/${issue.id}/reject/`);
      setConfirmSuccess(resp.data.detail || "Заявка отклонена.");

      setIssue((prev) =>
        prev
          ? {
              ...prev,
              status: "rejected",
            }
          : prev
      );
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setRejectError(
          `Ошибка при отклонении: ${JSON.stringify(err.response.data)}`
        );
      } else {
        setRejectError("Не удалось отклонить заявку.");
      }
    } finally {
      setRejectLoading(false);
    }
  };

  const renderReasonLabel = (reason) => {
    if (!reason) return "";
    switch (reason) {
      case "current_booking":
        return "Текущая бронь, клиент выбирает замену сам";
      case "current_equipment":
        return "Текущее оборудование по этой брони";
      case "no_free_same_type":
        return "Нет свободных ресурсов того же типа";
      default:
        return reason;
    }
  };

  const isNew = issue && issue.status === "new";

  // строки по ресурсам (рабочее место + оборудование)
  const resourceRows = [];

  if (booking) {
    if (booking.booking_type === "workspace" && booking.resource) {
      resourceRows.push({
        key: `main-${booking.id}`,
        kind: "workspace",
        label: "Рабочее место",
        bookingId: booking.id,
        resourceId: booking.resource.id,
        resourceName: booking.resource.name || `#${booking.resource.id}`,
        period:
          formatDateTime(booking.start_datetime) +
          " — " +
          formatDateTime(booking.end_datetime),
      });
    }

    (booking.children || [])
      .filter((c) => c.booking_type === "equipment" && c.resource)
      .forEach((c) => {
        resourceRows.push({
          key: `child-${c.id}`,
          kind: "equipment",
          label: "Оборудование",
          bookingId: c.id,
          resourceId: c.resource.id,
          resourceName: c.resource.name || `#${c.resource.id}`,
          period:
            formatDateTime(c.start_datetime) +
            " — " +
            formatDateTime(c.end_datetime),
        });
      });
  }

  // ================== RENDER ==================

  if (loading) {
    return (
      <div className="admin-issue-page">
        <div className="admin-issue-container">
          <div className="admin-issue-header">
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-issue-back-btn"
              onClick={() => navigate(-1)}
            >
              ← Назад
            </button>
            <h2 className="admin-issue-title">
              Заявка о поломке #{issueId}
            </h2>
          </div>
          <p className="admin-muted">Загрузка заявки...</p>
        </div>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="admin-issue-page">
        <div className="admin-issue-container">
          <div className="admin-issue-header">
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-issue-back-btn"
              onClick={() => navigate(-1)}
            >
              ← Назад
            </button>
            <h2 className="admin-issue-title">
              Заявка о поломке #{issueId}
            </h2>
          </div>
          {error && <p className="admin-alert-error">{error}</p>}
          {!issue && !error && (
            <p className="admin-muted">Заявка не найдена.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-issue-page">
      <div className="admin-issue-container">
        {/* Хедер */}
        <div className="admin-issue-header">
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-issue-back-btn"
            onClick={() => navigate(-1)}
          >
            ← Назад
          </button>

          <div className="admin-issue-header-main">
            <div>
              <h2 className="admin-issue-title">
                Заявка о поломке #{issue.id}
              </h2>
              <div className="admin-issue-subtitle">
                Создана:{" "}
                {issue.created_at ? formatDateTime(issue.created_at) : "—"}
              </div>
            </div>

            <span className={`issue-status issue-status-${issue.status}`}>
              {STATUS_LABELS[issue.status] || issue.status}
            </span>
          </div>
        </div>

        {/* Сетка: слева инфа, справа действия */}
        <div className="admin-issue-grid">
          {/* Левая колонка */}
          <div className="admin-issue-left">
            {/* Общая инфа по заявке */}
            <div className="admin-card">
              <h3 className="admin-card-title">Информация по заявке</h3>
              <div className="admin-issue-info-grid">
                <div className="admin-issue-info-item">
                  <div className="admin-issue-info-label">Тип</div>
                  <div className="admin-issue-info-value">
                    {ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}
                  </div>
                </div>
                <div className="admin-issue-info-item">
                  <div className="admin-issue-info-label">Пользователь</div>
                  <div className="admin-issue-info-value">
                    {issue.user ? issue.user.username : "—"}
                  </div>
                </div>
                <div className="admin-issue-info-item">
                  <div className="admin-issue-info-label">Бронь</div>
                  <div className="admin-issue-info-value">
                    {issue.booking ? (
                      <button
                        type="button"
                        className="admin-link-btn"
                        onClick={() =>
                          navigate(`/admin/bookings/${issue.booking}`)
                        }
                      >
                        Открыть бронирование #{issue.booking}
                      </button>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-issue-description">
                <div className="admin-issue-info-label">Описание проблемы</div>
                <div className="admin-issue-description-box">
                  {issue.description || "—"}
                </div>
              </div>
            </div>

            {/* Ресурсы по связанной брони */}
            <div className="admin-card">
              <h3 className="admin-card-title">Ресурсы по этому бронированию</h3>

              {!booking && (
                <p className="admin-muted">
                  Бронирование не привязано к заявке.
                </p>
              )}

              {booking && resourceRows.length === 0 && (
                <p className="admin-muted">
                  Ресурсы по бронированию не найдены.
                </p>
              )}

              {booking && resourceRows.length > 0 && (
                <div className="admin-table-wrapper admin-issue-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Выбрать</th>
                        <th>Тип</th>
                        <th>Ресурс</th>
                        <th>Период бронирования</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourceRows.map((row) => (
                        <tr key={row.key}>
                          <td className="admin-issue-checkbox-cell">
                            <input
                              type="checkbox"
                              checked={selectedResourceIds.includes(
                                row.resourceId
                              )}
                              onChange={() =>
                                toggleResourceSelection(row.resourceId)
                              }
                            />
                          </td>
                          <td>{row.label}</td>
                          <td>{row.resourceName}</td>
                          <td>{row.period}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Правая колонка: подтверждение / отклонение */}
          <div className="admin-issue-right">
            <div className="admin-card">
              <h3 className="admin-card-title">
                Подтверждение неисправности
              </h3>
              <p className="admin-issue-small">
                Укажите период, когда ресурс недоступен, и выберите ресурсы для
                вывода из работы. После подтверждения система попытается
                автоматически переназначить брони.
              </p>

              <div className="admin-issue-form">
                <label className="admin-issue-field">
                  <span className="admin-issue-info-label">
                    Начало недоступности
                  </span>
                  <input
                    type="datetime-local"
                    className="admin-input admin-input-datetime"
                    value={confirmStart}
                    onChange={(e) => setConfirmStart(e.target.value)}
                    disabled={!isNew}
                  />
                </label>

                <label className="admin-issue-field">
                  <span className="admin-issue-info-label">
                    Конец недоступности
                  </span>
                  <input
                    type="datetime-local"
                    className="admin-input admin-input-datetime"
                    value={confirmEnd}
                    onChange={(e) => setConfirmEnd(e.target.value)}
                    disabled={!isNew}
                  />
                </label>
              </div>

              {confirmError && (
                <p className="admin-alert-error">{confirmError}</p>
              )}
              {rejectError && (
                <p className="admin-alert-error">{rejectError}</p>
              )}
              {confirmSuccess && (
                <p className="admin-alert-success">{confirmSuccess}</p>
              )}

              <div className="admin-issue-actions">
                {isNew && (
                  <>
                    <button
                      type="button"
                      className="admin-btn"
                      onClick={handleConfirmIssue}
                      disabled={confirmLoading || rejectLoading}
                    >
                      {confirmLoading
                        ? "Подтверждаем..."
                        : "Подтвердить поломку"}
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      onClick={handleRejectIssue}
                      disabled={rejectLoading || confirmLoading}
                    >
                      {rejectLoading ? "Отклоняем..." : "Отклонить заявку"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => navigate(-1)}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Сводка изменений после подтверждения */}
        {impact && (
          <div className="admin-card admin-issue-impact">
            <h3 className="admin-card-title">
              Изменения после вывода ресурса
            </h3>

            <p className="admin-issue-impact-summary">
              <strong>Автоматически перенесено броней:</strong>{" "}
              {impact.autoReassignedCount}
              <br />
              <strong>Помечено конфликтными:</strong>{" "}
              {impact.conflictedCount}
            </p>

            {impact.autoReassigned && impact.autoReassigned.length > 0 && (
              <div className="admin-issue-impact-block">
                <h4 className="admin-issue-impact-title">
                  Автоматически перенесённые брони
                </h4>
                <div className="admin-table-wrapper admin-issue-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Бронь</th>
                        <th>Был ресурс</th>
                        <th>Новый ресурс</th>
                        <th>Период</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impact.autoReassigned.map((b) => (
                        <tr key={`auto-${b.id}`}>
                          <td>
                            <button
                              type="button"
                              className="admin-link-btn"
                              onClick={() =>
                                navigate(`/admin/bookings/${b.id}`)
                              }
                            >
                              #{b.id}
                            </button>
                          </td>
                          <td>
                            {b.old_resource_name} (#{b.old_resource_id})
                          </td>
                          <td>
                            {b.new_resource_name} (#{b.new_resource_id})
                          </td>
                          <td>
                            {formatDateTime(b.start_datetime)} —{" "}
                            {formatDateTime(b.end_datetime)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {impact.conflicted && impact.conflicted.length > 0 && (
              <div className="admin-issue-impact-block">
                <h4 className="admin-issue-impact-title">
                  Брони, требующие ручной обработки
                </h4>
                <div className="admin-table-wrapper admin-issue-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Бронь</th>
                        <th>Ресурс</th>
                        <th>Период</th>
                        <th>Причина</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impact.conflicted.map((b) => (
                        <tr key={`conf-${b.id}-${b.resource_id}`}>
                          <td>
                            <button
                              type="button"
                              className="admin-link-btn"
                              onClick={() =>
                                navigate(`/admin/bookings/${b.id}`)
                              }
                            >
                              #{b.id}
                            </button>
                          </td>
                          <td>
                            {b.resource_name} (#{b.resource_id})
                          </td>
                          <td>
                            {formatDateTime(b.start_datetime)} —{" "}
                            {formatDateTime(b.end_datetime)}
                          </td>
                          <td>{renderReasonLabel(b.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminIssueDetailPage;
