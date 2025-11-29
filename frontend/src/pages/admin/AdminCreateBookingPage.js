// src/pages/admin/AdminCreateBookingPage.js
import React, { useEffect, useMemo, useState } from "react";
import api from "../../api";

const BOOKING_TYPES = [
  { value: "workspace", label: "Рабочее место" },
  { value: "equipment", label: "Оборудование" },
  { value: "service", label: "Услуга" },
  { value: "parking", label: "Парковка" },
  { value: "locker", label: "Локер" },
];

const AdminCreateBookingPage = () => {
  const [bookingType, setBookingType] = useState("workspace");
  const [mode, setMode] = useState("hours"); // hours | day | month
  const [dateFrom, setDateFrom] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourcesError, setResourcesError] = useState(null);

  const [resourceId, setResourceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Загружаем все ресурсы один раз
  useEffect(() => {
    const fetchResources = async () => {
      setLoadingResources(true);
      setResourcesError(null);
      try {
        const resp = await api.get("/resources/");
        setResources(resp.data);
      } catch (err) {
        console.error(err);
        setResourcesError("Не удалось загрузить список ресурсов");
      } finally {
        setLoadingResources(false);
      }
    };
    fetchResources();
  }, []);

  // Ресурсы по выбранному типу
  const filteredResources = useMemo(() => {
    return resources.filter(
      (r) => r.type?.category?.code === bookingType && r.status === "active"
    );
  }, [resources, bookingType]);

  // Сборка дат/времени (логика как в WorkspaceBookingDetailPage)
  const buildDatetimes = () => {
    if (!dateFrom) {
      throw new Error("Укажите дату начала бронирования");
    }

    if (mode === "hours") {
      if (!startTime || !endTime) {
        throw new Error("Укажите время начала и окончания для почасовой брони");
      }
      if (endTime <= startTime) {
        throw new Error("Время окончания должно быть позже времени начала");
      }
      const start = `${dateFrom}T${startTime}:00`;
      const end = `${dateFrom}T${endTime}:00`;
      return { start, end, time_format: "hour" };
    }

    if (mode === "day") {
      const start = `${dateFrom}T00:00:00`;
      const end = `${dateFrom}T23:59:59`;
      return { start, end, time_format: "day" };
    }

    if (mode === "month") {
      const d = new Date(dateFrom);
      if (Number.isNaN(d.getTime())) {
        throw new Error("Некорректная дата для месячной брони");
      }
      const endDate = new Date(d);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // последний день предыдущего месяца

      const year = endDate.getFullYear();
      const month = String(endDate.getMonth() + 1).padStart(2, "0");
      const day = String(endDate.getDate()).padStart(2, "0");
      const monthEndDate = `${year}-${month}-${day}`;

      const start = `${dateFrom}T00:00:00`;
      const end = `${monthEndDate}T23:59:59`;
      return { start, end, time_format: "month" };
    }

    throw new Error("Неизвестный формат бронирования");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!resourceId) {
      setSubmitError("Выберите ресурс");
      return;
    }

    let start, end, time_format;
    try {
      const res = buildDatetimes();
      start = res.start;
      end = res.end;
      time_format = res.time_format;
    } catch (err) {
      setSubmitError(err.message);
      return;
    }

    const payload = {
      resource_id: Number(resourceId),
      booking_type: bookingType,
      time_format,
      start_datetime: start,
      end_datetime: end,
    };

    setSubmitting(true);
    try {
      const resp = await api.post("/bookings/", payload);
      console.log("Admin booking created:", resp.data);
      setSubmitSuccess(`Бронь #${resp.data.id} успешно создана`);
      // при желании можно сбрасывать форму:
      // setResourceId(""); setDateFrom(""); setStartTime(""); setEndTime("");
    } catch (err) {
      console.error(err);
      const serverMsg =
        (err.response && JSON.stringify(err.response.data)) ||
        "Не удалось создать бронь";
      setSubmitError(serverMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 10 }}>
      <h2>Админ: создать бронь</h2>

      <p style={{ marginBottom: 16 }}>
        Бронь создаётся на текущего пользователя (админа). Позже можно будет
        добавить выбор клиента.
      </p>

      {resourcesError && (
        <p style={{ color: "red" }}>{resourcesError}</p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid #ddd",
          borderRadius: 4,
          padding: 16,
          marginBottom: 24,
        }}
      >
        {/* Тип бронирования */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Тип бронирования:
          </label>
          {BOOKING_TYPES.map((t) => (
            <label key={t.value} style={{ marginRight: 12 }}>
              <input
                type="radio"
                value={t.value}
                checked={bookingType === t.value}
                onChange={() => {
                  setBookingType(t.value);
                  setResourceId("");
                }}
              />{" "}
              {t.label}
            </label>
          ))}
        </div>

        {/* Ресурс */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Ресурс:
          </label>
          {loadingResources ? (
            <p>Загрузка ресурсов...</p>
          ) : (
            <select
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              style={{ minWidth: 300 }}
            >
              <option value="">— выберите ресурс —</option>
              {filteredResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.type?.name})
                </option>
              ))}
            </select>
          )}
          {filteredResources.length === 0 && !loadingResources && (
            <p style={{ fontSize: 12, color: "#666" }}>
              Нет активных ресурсов для выбранного типа.
            </p>
          )}
        </div>

        {/* Формат времени */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Формат бронирования:
          </label>
          <label style={{ marginRight: 10 }}>
            <input
              type="radio"
              value="hours"
              checked={mode === "hours"}
              onChange={() => setMode("hours")}
            />{" "}
            Часы
          </label>
          <label style={{ marginRight: 10 }}>
            <input
              type="radio"
              value="day"
              checked={mode === "day"}
              onChange={() => setMode("day")}
            />{" "}
            День
          </label>
          <label>
            <input
              type="radio"
              value="month"
              checked={mode === "month"}
              onChange={() => setMode("month")}
            />{" "}
            Месяц
          </label>
        </div>

        {/* Дата / время */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Дата начала:
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        {mode === "hours" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ marginRight: 12 }}>
              Время с:
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ marginLeft: 4 }}
              />
            </label>
            <label>
              до:
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ marginLeft: 4 }}
              />
            </label>
          </div>
        )}

        {submitError && (
          <p style={{ color: "red", whiteSpace: "pre-wrap" }}>{submitError}</p>
        )}
        {submitSuccess && (
          <p style={{ color: "green" }}>{submitSuccess}</p>
        )}

        <button type="submit" disabled={submitting || loadingResources}>
          {submitting ? "Создаём бронь..." : "Создать бронь"}
        </button>
      </form>
    </div>
  );
};

export default AdminCreateBookingPage;
