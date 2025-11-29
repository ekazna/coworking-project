// src/pages/admin/AdminResourceDetailPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminResourcesPage.css";

const STATUS_LABELS = {
  active: "Активен",
  broken: "Неисправен",
  maintenance: "На обслуживании",
};

const AdminResourceDetailPage = () => {
  const { resourceId } = useParams();
  const navigate = useNavigate();

  const [resource, setResource] = useState(null);
  const [types, setTypes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  const [outages, setOutages] = useState([]);
  const [outagesLoading, setOutagesLoading] = useState(false);
  const [outagesError, setOutagesError] = useState(null);

  // форма ресурса
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [status, setStatus] = useState("active");

  // форма "вывести из работы на период"
  const [outageStart, setOutageStart] = useState("");
  const [outageEnd, setOutageEnd] = useState("");
  const [outageProcessing, setOutageProcessing] = useState(false);
  const [outageError, setOutageError] = useState(null);

  // сводка перераспределения для outages
  const [outageImpact, setOutageImpact] = useState(null);

  const toLocalInputValue = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

  const formatDateTime = (dt) => {
    if (!dt) return "";
    return dt.replace("T", " ").slice(0, 16);
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    setSaveMessage(null);
    setSaveError(null);
    setOutageError(null);
    setOutageImpact(null);

    try {
      const [resResp, typesResp] = await Promise.all([
        api.get(`/resources/${resourceId}/`),
        api.get("/resource-types/"),
      ]);

      const res = resResp.data;
      setResource(res);
      setTypes(typesResp.data || []);

      setName(res.name || "");
      setDescription(res.description || "");
      setTypeId(res.type?.id || "");
      setCapacity(res.capacity ?? "");
      setStatus(res.status || "active");
    } catch (err) {
      console.error(err);
      setLoadError("Не удалось загрузить ресурс.");
    } finally {
      setLoading(false);
    }

    // загрузка outages
    try {
      setOutagesLoading(true);
      setOutagesError(null);
      const outResp = await api.get("/resource-outages/", {
        params: { resource: resourceId },
      });
      const data = outResp.data || [];
      setOutages(data);

      // дефолтные значения периода: сейчас и +1 час
      const now = new Date();
      const plusHour = new Date(now.getTime() + 60 * 60 * 1000);
      setOutageStart(toLocalInputValue(now));
      setOutageEnd(toLocalInputValue(plusHour));
    } catch (err) {
      console.error(err);
      setOutagesError("Не удалось загрузить периоды недоступности ресурса.");
    } finally {
      setOutagesLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError(null);
    setSaveMessage(null);
    setSaving(true);

    try {
      const payload = {
        name: name || "",
        description: description || "",
        type_id: typeId ? Number(typeId) : null,
        capacity: capacity === "" ? null : Number(capacity),
        status,
      };

      const resp = await api.put(`/resources/${resourceId}/`, payload);
      setResource(resp.data);
      setSaveMessage("Изменения сохранены.");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setSaveError(
          `Не удалось сохранить ресурс: ${JSON.stringify(
            err.response.data
          )}`
        );
      } else {
        setSaveError("Не удалось сохранить ресурс.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOutage = async (outageId) => {
    if (!window.confirm("Удалить этот период недоступности?")) return;
    try {
      await api.delete(`/resource-outages/${outageId}/`);
      setOutages((prev) => prev.filter((o) => o.id !== outageId));
    } catch (err) {
      console.error(err);
      alert("Не удалось удалить период недоступности.");
    }
  };

  const computeCurrentState = () => {
    if (!resource) return "";
    const base = STATUS_LABELS[resource.status] || resource.status;
    if (!outages.length) return base || "Активен";

    const now = new Date();
    const activeOutage = outages.find((o) => {
      const s = new Date(o.start_datetime);
      const e = new Date(o.end_datetime);
      return s <= now && now < e;
    });

    if (activeOutage) {
      return `${base || "Активен"}, сейчас недоступен до ${formatDateTime(
        activeOutage.end_datetime
      )}`;
    }

    return base || "Активен";
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

  // вывод ресурса из работы на период с перераспределением
  const handleCreateOutageWithRedistribution = async () => {
    setOutageError(null);
    setOutageImpact(null);

    if (!outageStart || !outageEnd) {
      setOutageError("Укажите начало и конец периода недоступности ресурса.");
      return;
    }

    setOutageProcessing(true);
    try {
      const payload = {
        resource_id: Number(resourceId),
        start_datetime: outageStart,
        end_datetime: outageEnd,
      };

      const resp = await api.post(
        "/resource-outages/with-redistribution/",
        payload
      );

      await fetchData();

      setOutageImpact({
        autoReassigned: resp.data.auto_reassigned_bookings || [],
        conflicted: resp.data.conflicted_bookings || [],
        autoReassignedCount: resp.data.auto_reassigned_count || 0,
        conflictedCount: resp.data.conflicted_count || 0,
      });

      if (resp.data.detail) {
        setSaveMessage(resp.data.detail);
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setOutageError(
          `Ошибка при выводе ресурса из работы: ${JSON.stringify(
            err.response.data
          )}`
        );
      } else {
        setOutageError("Не удалось вывести ресурс из работы.");
      }
    } finally {
      setOutageProcessing(false);
    }
  };

  // перераспределить все будущие брони, если ресурс "неисправен"
  const handleRedistributeAllFuture = async () => {
    if (
      !window.confirm(
        "Перераспределить все будущие брони этого ресурса на другие ресурсы того же типа? Это действие затронет всех клиентов."
      )
    ) {
      return;
    }

    setOutageError(null);
    setOutageImpact(null);
    setOutageProcessing(true);

    try {
      const payload = {
        resource_id: Number(resourceId),
        mode: "all_future",
      };

      const resp = await api.post(
        "/resource-outages/with-redistribution/",
        payload
      );

      await fetchData();

      setOutageImpact({
        autoReassigned: resp.data.auto_reassigned_bookings || [],
        conflicted: resp.data.conflicted_bookings || [],
        autoReassignedCount: resp.data.auto_reassigned_count || 0,
        conflictedCount: resp.data.conflicted_count || 0,
      });

      if (resp.data.detail) {
        setSaveMessage(resp.data.detail);
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setOutageError(
          `Ошибка при перераспределении: ${JSON.stringify(
            err.response.data
          )}`
        );
      } else {
        setOutageError("Не удалось перераспределить все будущие брони.");
      }
    } finally {
      setOutageProcessing(false);
    }
  };

  const renderStatusBadge = (s) => {
    const label = STATUS_LABELS[s] || s || "—";
    return (
      <span className={`resource-status-badge resource-status-${s}`}>
        {label}
      </span>
    );
  };

  const isBroken = status === "broken";

  // ---- РЕНДЕР СОСТОЯНИЙ ----

  if (loading) {
    return (
      <div className="admin-resources-page">
        <div className="admin-resources-container">
          <div className="admin-resources-header">
            <h2 className="admin-resources-title">Ресурс #{resourceId}</h2>
            <button
              className="admin-btn admin-btn-secondary"
              type="button"
              onClick={() => navigate(-1)}
            >
              ← Назад
            </button>
          </div>
          <p className="admin-muted">Загрузка…</p>
        </div>
      </div>
    );
  }

  if (loadError || !resource) {
    return (
      <div className="admin-resources-page">
        <div className="admin-resources-container">
          <div className="admin-resources-header">
            <h2 className="admin-resources-title">Ресурс #{resourceId}</h2>
            <button
              className="admin-btn admin-btn-secondary"
              type="button"
              onClick={() => navigate(-1)}
            >
              ← Назад
            </button>
          </div>
          {loadError && <p className="admin-alert-error">{loadError}</p>}
          {!resource && !loadError && (
            <p className="admin-muted">Ресурс не найден.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-resources-page">
      <div className="admin-resources-container">
        {/* Шапка */}
        <div className="admin-resources-header">
          <h2 className="admin-resources-title">
            Ресурс #{resource.id} — {resource.name}
          </h2>
          <button
            className="admin-btn admin-btn-secondary"
            type="button"
            onClick={() => navigate(-1)}
          >
            ← Назад к списку ресурсов
          </button>
        </div>

        <p className="admin-muted">
          <strong>Текущее состояние:</strong> {computeCurrentState()}
        </p>

        {saveError && (
          <p className="admin-alert-error" style={{ whiteSpace: "pre-wrap" }}>
            {saveError}
          </p>
        )}
        {saveMessage && (
          <p style={{ color: "#15803d", margin: "8px 0" }}>{saveMessage}</p>
        )}

        {/* Карточка: основная информация */}
        <div className="admin-card admin-resources-form-card">
          <h3 className="admin-card-title">Основная информация</h3>

          <form onSubmit={handleSave} className="admin-resources-form">
            <div className="admin-form-row">
              <label className="admin-form-label">Название</label>
              <input
                type="text"
                className="admin-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-form-label">Тип ресурса</label>
              <select
                className="admin-select"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
              >
                <option value="">—</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.category ? ` (${t.category.name})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-row admin-form-row-inline">
              <div className="admin-form-col">
                <label className="admin-form-label">Вместимость</label>
                <input
                  type="number"
                  min="0"
                  className="admin-input"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>

              <div className="admin-form-col">
                <label className="admin-form-label">Статус</label>
                <select
                  className="admin-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="active">Активен</option>
                  <option value="broken">Неисправен</option>
                  <option value="maintenance">На обслуживании</option>
                </select>
              </div>

              
            </div>

            <div className="admin-form-row">
              <label className="admin-form-label">Описание</label>
              <textarea
                className="admin-input admin-input-textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="admin-form-actions">
              <button
                type="submit"
                className="admin-btn"
                disabled={saving}
              >
                {saving ? "Сохраняем..." : "Сохранить изменения"}
              </button>
            </div>
          </form>
        </div>

        {/* Карточка: вывод из работы на период */}
        <div className="admin-card">
          <h3 className="admin-card-title">
            Вывод ресурса из работы и перераспределение
          </h3>

          <div className="admin-form-row admin-form-row-inline">
            <div className="admin-form-col">
              <label className="admin-form-label">Начало недоступности</label>
              <input
                type="datetime-local"
                className="admin-input"
                value={outageStart}
                onChange={(e) => setOutageStart(e.target.value)}
              />
            </div>

            <div className="admin-form-col">
              <label className="admin-form-label">Конец недоступности</label>
              <input
                type="datetime-local"
                className="admin-input"
                value={outageEnd}
                onChange={(e) => setOutageEnd(e.target.value)}
              />
            </div>
          </div>

          {outageError && (
            <p className="admin-alert-error" style={{ marginTop: 8 }}>
              {outageError}
            </p>
          )}

          <div className="admin-form-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="admin-btn"
              onClick={handleCreateOutageWithRedistribution}
              disabled={outageProcessing}
            >
              {outageProcessing
                ? "Обрабатываем..."
                : "Вывести из работы и перераспределить брони"}
            </button>

            {isBroken && (
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={handleRedistributeAllFuture}
                disabled={outageProcessing}
              >
                {outageProcessing
                  ? "Обрабатываем..."
                  : "Перераспределить все будущие брони (ресурс неисправен)"}
              </button>
            )}
          </div>
        </div>

        {/* Карточка: периоды недоступности */}
        <div className="admin-card">
          <h3 className="admin-card-title">Периоды недоступности ресурса</h3>

          {outagesLoading && (
            <p className="admin-muted">Загрузка периодов недоступности…</p>
          )}
          {outagesError && (
            <p className="admin-alert-error">{outagesError}</p>
          )}

          {!outagesLoading && outages.length === 0 && !outagesError && (
            <p className="admin-muted">
              Нет зарегистрированных периодов недоступности.
            </p>
          )}

          {!outagesLoading && outages.length > 0 && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Причина</th>
                    <th>Начало</th>
                    <th>Конец</th>
                    <th className="admin-table-actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {outages.map((o) => (
                    <tr key={o.id}>
                      <td>{o.id}</td>
                      <td>{o.reason || "—"}</td>
                      <td>{formatDateTime(o.start_datetime)}</td>
                      <td>{formatDateTime(o.end_datetime)}</td>
                      <td className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn-small admin-btn-danger"
                          onClick={() => handleDeleteOutage(o.id)}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Карточка: сводка по перераспределению */}
        {outageImpact && (
          <div className="admin-card">
            <h3 className="admin-card-title">Изменения по бронированиям</h3>

            <p className="admin-muted" style={{ marginBottom: 12 }}>
              <strong>Автоматически перенесено броней:</strong>{" "}
              {outageImpact.autoReassignedCount}
              <br />
              <strong>Помечено конфликтными:</strong>{" "}
              {outageImpact.conflictedCount}
            </p>

            {outageImpact.autoReassigned &&
              outageImpact.autoReassigned.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ marginBottom: 6 }}>
                    Автоматически перенесённые брони
                  </h4>
                  <div className="admin-table-wrapper">
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
                        {outageImpact.autoReassigned.map((b) => (
                          <tr key={`auto-${b.id}`}>
                            <td>#{b.id}</td>
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

            {outageImpact.conflicted &&
              outageImpact.conflicted.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: 6 }}>
                    Брони, требующие ручной обработки
                  </h4>
                  <div className="admin-table-wrapper">
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
                        {outageImpact.conflicted.map((b) => (
                          <tr
                            key={`conf-${b.id}-${b.resource_id}`}
                          >
                            <td>#{b.id}</td>
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

export default AdminResourceDetailPage;
