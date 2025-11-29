// src/pages/WorkspaceBookingPage.js
import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import TimeSelect15 from "../components/TimeSelect15";
import "../styles/WorkspaceBookingPage.css";

const getTomorrowDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const WorkspaceBookingPage = () => {
  // по умолчанию: завтра, 12:00–14:00
  const [date, setDate] = useState(getTomorrowDateString);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("14:00");
  const [mode, setMode] = useState("hours"); // "hours" | "day" | "month"
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  // дата конца месячной брони
  const calcMonthEndDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";

    const end = new Date(d);
    end.setMonth(end.getMonth() + 1);

    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, "0");
    const day = String(end.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleSearch = async () => {
    setError(null);
    setResources([]);

    if (!date) {
      setError("Выберите дату.");
      return;
    }

    let params = {};

    if (mode === "hours") {
      if (!startTime || !endTime) {
        setError("Для почасовой брони укажите время начала и окончания.");
        return;
      }

      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);

      if (sm % 15 !== 0 || em % 15 !== 0) {
        setError(
          "Время начала и окончания должно быть с шагом 15 минут (00, 15, 30, 45)."
        );
        return;
      }

      params.start_datetime = `${date}T${startTime}:00`;
      params.end_datetime = `${date}T${endTime}:00`;
      params.time_format = "hour";
    } else if (mode === "day") {
      params.start_datetime = `${date}T06:00:00`;
      params.end_datetime = `${date}T23:00:00`;
      params.time_format = "day";
    } else if (mode === "month") {
      const monthEndDate = calcMonthEndDate(date);
      if (!monthEndDate) {
        setError("Не удалось вычислить дату окончания месячной брони.");
        return;
      }
      params.start_datetime = `${date}T06:00:00`;
      params.end_datetime = `${monthEndDate}T23:00:00`;
      params.time_format = "month";
    }

    params.booking_type = "workspace";

    setLoading(true);
    try {
      const response = await api.get("/resources/available/", { params });
      setResources(response.data || []);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить доступные рабочие места.");
    } finally {
      setLoading(false);
    }
  };

  // группируем фиксированные/переговорки по типу
  const { groupedTypes, nonGroupedResources } = useMemo(() => {
    const groupedMap = {};
    const plain = [];

    (resources || []).forEach((res) => {
      const t = res.type;
      const typeName = (t && t.name ? t.name : "").toLowerCase();
      const catCode =
        t && t.category && t.category.code
          ? String(t.category.code).toLowerCase()
          : "";

      const isFixedType =
        typeName.includes("фиксирован") || typeName.includes("fixed");

      const isMeetingType =
        typeName.includes("переговор") ||
        typeName.includes("meeting") ||
        catCode === "meeting_room" ||
        catCode === "meeting";

      const isGrouped = isFixedType || isMeetingType;

      if (isGrouped && t) {
        const key = t.id || typeName || res.id;
        if (!groupedMap[key]) {
          groupedMap[key] = {
            type: t,
            availableCount: 0,
          };
        }
        groupedMap[key].availableCount += 1;
      } else {
        plain.push(res);
      }
    });

    return {
      groupedTypes: Object.values(groupedMap),
      nonGroupedResources: plain,
    };
  }, [resources]);

  const handleSelectResource = (resourceId) => {
    navigate(`/bookings/workspace/${resourceId}`, {
      state: { date, startTime, endTime, mode },
    });
  };

  const handleSelectGroupedType = (typeId, typeName) => {
    navigate(`/bookings/workspace/fixed-${typeId}`, {
      state: {
        date,
        startTime,
        endTime,
        mode,
        isFixed: true,
        resourceTypeId: typeId,
        resourceTypeName: typeName,
      },
    });
  };

  return (
    <div className="booking-page">
      <div className="booking-container">
        <h2 className="booking-title">Бронирование рабочего места</h2>
        <p className="booking-subtitle">
          Выберите дату, формат бронирования и посмотрите доступные места.
        </p>

        {/* Фильтры */}
        <div className="booking-filters-card">
          <div className="booking-filters-row">
            <div className="booking-filter-field">
              <label className="booking-label">Дата</label>
              <input
                type="date"
                className="booking-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {mode === "month" && (
              <div className="booking-filter-field booking-filter-field--readonly">
                <label className="booking-label">Длительность</label>
                <div className="booking-pill">1 месяц с выбранной даты</div>
              </div>
            )}
          </div>

          <div className="booking-filters-row booking-filters-row--wrap">
            <div className="booking-filter-field">
              <label className="booking-label">Формат бронирования</label>
              <div className="booking-radio-group">
                <label className="booking-radio">
                  <input
                    type="radio"
                    value="hours"
                    checked={mode === "hours"}
                    onChange={() => setMode("hours")}
                  />
                  <span>Часы</span>
                </label>
                <label className="booking-radio">
                  <input
                    type="radio"
                    value="day"
                    checked={mode === "day"}
                    onChange={() => setMode("day")}
                  />
                  <span>День</span>
                </label>
                <label className="booking-radio">
                  <input
                    type="radio"
                    value="month"
                    checked={mode === "month"}
                    onChange={() => setMode("month")}
                  />
                  <span>Месяц</span>
                </label>
              </div>
              <p className="booking-mode-hint">
                День или месяц: 06:00–23:00
              </p>
            </div>

            {mode === "hours" && (
              <><div className="booking-time-row">
                <div className="booking-filter-field booking-time-field">
                  <TimeSelect15
                    label="Время с"
                    value={startTime}
                    onChange={setStartTime}
                  />
                </div>
                <div className="booking-filter-field booking-time-field">
                  <TimeSelect15
                    label="Время до"
                    value={endTime}
                    onChange={setEndTime}
                  />
                </div>
              </div></>
            )}
          </div>

          {error && <div className="alert-error booking-error">{error}</div>}

          <button
            type="button"
            className="btn btn-primary booking-submit"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? "Загружаем..." : "Показать доступные места"}
          </button>
        </div>

        {/* Результаты */}
        <div className="booking-results">
          <h3 className="booking-results-title">Доступные рабочие места</h3>

          {loading && <p className="booking-results-hint">Загрузка...</p>}

          {!loading && resources.length === 0 && !error && (
            <p className="booking-results-hint">
              Нет доступных рабочих мест по заданным параметрам.
            </p>
          )}

          <div className="resource-grid">
            {/* Группируемые типы (фикс / переговорки / open space) */}
            {groupedTypes.map((group, idx) => {
              const t = group.type || {};
              const typeId = t.id || `grouped-${idx}`;
              const typeName = t.name || "Рабочее место";

              const lowerName = (t.name || "").toLowerCase();
              const isMeeting =
                lowerName.includes("переговор") || lowerName.includes("meeting");
              const isFixed =
                lowerName.includes("фиксирован") || lowerName.includes("fixed");

              // подпись на бейдже
              const badgeLabel = isMeeting ? "Комната" : "Стол";

              // подбираем картинку по типу
              let imageSrc = "/images/dflex.jpg";
              if (isMeeting) imageSrc = "/images/meeting-room.jpg";
              else if (isFixed) imageSrc = "/images/desk-fixed.jpg";

              return (
                <div
                  key={`grouped-${typeId}`}
                  className={`resource-card resource-card--large ${
                    isMeeting ? "resource-card--meeting" : "resource-card--fixed"
                  }`}
                >
                  <div className="resource-image-wrapper">
                    <img
                      src={imageSrc}
                      alt={typeName}
                      className="resource-image"
                    />
                  </div>

                  <div className="resource-card-body">
                    <div className="resource-card-header">
                      <h4 className="resource-title">{typeName}</h4>
                      <span className="badge badge-type">{badgeLabel}</span>
                    </div>

                    <p className="resource-text">
                      Доступно объектов: <strong>{group.availableCount}</strong>
                      {isMeeting ? " (комнаты)" : " (места)"}
                    </p>

                    <p className="resource-text resource-text-muted">
                      {isMeeting ? "Конкретная переговорная" : "Конкретный стол"} будет автоматически
                      выбран(а) системой при оформлении брони.
                    </p>

                    <button
                      type="button"
                      className="btn btn-outline resource-btn resource-btn-full"
                      onClick={() => handleSelectGroupedType(typeId, typeName)}
                    >
                      {isMeeting ? "Выбрать переговорную" : "Выбрать место этого типа"}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Обычные ресурсы (индивидуальные места и т.п.) */}
            {nonGroupedResources.map((res) => {
              const typeName =
                typeof res.type === "string"
                  ? res.type
                  : res.type?.name || res.type?.code;

              const lowerName = (res.name || "").toLowerCase();

              // подбираем картинку для общего зала и прочих мест
              let imageSrc = "/images/dflex.jpg";
              if (lowerName.includes("общий зал") || lowerName.includes("open space")) {
                imageSrc = "/images/dflex.jpg";     // твоя картинка общего зала
              }

              return (
                <div key={res.id} className="resource-card">
                  <div className="resource-image-wrapper">
                    <img
                      src={imageSrc}
                      alt={res.name || "Рабочее место"}
                      className="resource-image"
                    />
                  </div>

                  <div className="resource-card-body">
                    <div className="resource-card-header">
                      <h4 className="resource-title">
                        {res.name || `Рабочее место #${res.id}`}
                      </h4>
                      {typeName && (
                        <span className="badge badge-type-secondary">
                          {typeName}
                        </span>
                      )}
                    </div>

                    {typeof res.capacity !== "undefined" && (
                    <>
                      <p className="resource-text">
                        Вместимость: <strong>{res.capacity}</strong>
                      </p>
                      {typeof res.free_capacity === "number" && (
                        <p className="resource-text">
                          Свободно: <strong>{res.free_capacity}</strong>
                        </p>
                      )}
                    </>
                  )}

                    {res.description && (
                      <p className="resource-text resource-text-muted">
                        {res.description}
                      </p>
                    )}

                    <button
                      type="button"
                      className="btn btn-outline resource-btn resource-btn-full"
                      onClick={() => handleSelectResource(res.id)}
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceBookingPage;
