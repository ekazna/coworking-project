// src/pages/EquipmentBookingPage.js
import React, { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import "../styles/EquipmentBookingPage.css";

const WORKDAY_START = 6;
const WORKDAY_END = 23;

const minutesOptions = [0, 15, 30, 45];

const pad2 = (n) => String(n).padStart(2, "0");

// из "12:30" → { h: 12, m: 30 }
const parseTimeHM = (str) => {
  if (!str) return null;
  const [h, m] = str.split(":");
  const hh = parseInt(h, 10);
  const mm = parseInt(m || "0", 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return { h: hh, m: mm };
};

// "2025-11-27T12:00:00"
const buildDateTimeStr = (dateStr, h, m) =>
  `${dateStr}T${pad2(h)}:${pad2(m)}:00`;

let rowIdCounter = 1;
const makeRow = () => ({
  id: rowIdCounter++,
  typeId: "",
  quantity: 1,
  checking: false,
  availableCount: null,
  error: null,
});

const EquipmentBookingPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState(null);

  const [equipmentTypes, setEquipmentTypes] = useState([]);

  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [selectedDate, setSelectedDate] = useState(""); // YYYY-MM-DD
  const [startHour, setStartHour] = useState(12);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(14);
  const [endMinute, setEndMinute] = useState(0);

  const [rows, setRows] = useState([makeRow()]);
  const [bulkError, setBulkError] = useState(null);
  const [bulkSuccess, setBulkSuccess] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // ----- загрузка моих активных броней рабочего места -----
  useEffect(() => {
    const load = async () => {
      setBookingsLoading(true);
      setBookingsError(null);
      try {
        const resp = await api.get("/bookings/my/", {
          params: { status: "active" },
        });
        const data = (resp.data || []).filter(
          (b) => b.booking_type === "workspace"
        );
        setBookings(data);
      } catch (e) {
        console.error(e);
        setBookingsError("Не удалось загрузить активные бронирования.");
      } finally {
        setBookingsLoading(false);
      }
    };

    load();
  }, []);

  // ----- загрузка типов ресурсов (оборудование) -----
  useEffect(() => {
    const loadTypes = async () => {
      try {
        const resp = await api.get("/resource-types/");
        const all = resp.data || [];
        const equipmentOnly = all.filter((t) => {
          const cat = t.category;
          if (cat && typeof cat === "object") {
            const code = (cat.code || "").toLowerCase();
            const name = (cat.name || "").toLowerCase();
            if (code === "equipment" || name.includes("оборуд")) return true;
            if (code === "workspace" || name.includes("рабоч")) return false;
          }
          const n = (t.name || "").toLowerCase();
          const equipmentKeywords = [
            "monitor",
            "монитор",
            "keyboard",
            "клавиатура",
            "mouse",
            "мышь",
            "headset",
            "науш",
            "webcam",
            "камера",
          ];
          const workspaceKeywords = [
            "desk",
            "стол",
            "рабочее место",
            "workspace",
            "фиксированное",
          ];
          if (equipmentKeywords.some((k) => n.includes(k))) return true;
          if (workspaceKeywords.some((k) => n.includes(k))) return false;
          return false;
        });
        setEquipmentTypes(equipmentOnly);
      } catch (e) {
        console.error("Ошибка загрузки типов ресурсов", e);
        setEquipmentTypes([]);
      }
    };

    loadTypes();
  }, []);

  // ----- применяем query-параметры -----
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qBookingId = params.get("bookingId");
    const qDate = params.get("date"); // YYYY-MM-DD
    const qFrom = params.get("from"); // HH:MM
    const qTo = params.get("to"); // HH:MM

    if (qBookingId) setSelectedBookingId(qBookingId);

    if (qDate) {
      setSelectedDate(qDate);
    }

    if (qFrom) {
      const t = parseTimeHM(qFrom);
      if (t) {
        setStartHour(t.h);
        setStartMinute(t.m);
      }
    }

    if (qTo) {
      const t = parseTimeHM(qTo);
      if (t) {
        setEndHour(t.h);
        setEndMinute(t.m);
      }
    }
  }, [location.search]);

  // если query не задали дату — выставляем по выбранной брони
  const selectedBooking = useMemo(
    () =>
      bookings.find((b) => String(b.id) === String(selectedBookingId)) || null,
    [bookings, selectedBookingId]
  );

  useEffect(() => {
    if (!selectedBooking && bookings.length === 1) {
      setSelectedBookingId(String(bookings[0].id));
    }
  }, [bookings, selectedBooking]);

  useEffect(() => {
    if (!selectedDate && selectedBooking) {
      setSelectedDate(selectedBooking.start_datetime.slice(0, 10));
    }
  }, [selectedBooking, selectedDate]);

  // ----- вспомогательное: границы родительской брони -----
  const parentIntervalText = useMemo(() => {
    if (!selectedBooking) return null;
    const s = selectedBooking.start_datetime;
    const e = selectedBooking.end_datetime;
    const dateS = s.slice(0, 10);
    const dateE = e.slice(0, 10);
    const timeS = s.slice(11, 16);
    const timeE = e.slice(11, 16);
    return {
      text: `${dateS} ${timeS} — ${dateE} ${timeE}`,
      dateS,
      dateE,
      timeS,
      timeE,
    };
  }, [selectedBooking]);

  // ----- обработчики -----

  const handleAddRow = () => {
    setRows((prev) => [...prev, makeRow()]);
  };

  const handleChangeRowField = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, [field]: value, availableCount: null, error: null } : r
      )
    );
  };

  const handleRemoveRow = (id) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const getIntervalStrings = () => {
    if (!selectedDate) return null;

    const startStr = buildDateTimeStr(selectedDate, startHour, startMinute);
    const endStr = buildDateTimeStr(selectedDate, endHour, endMinute);
    return { startStr, endStr };
  };

  const handleCheckRowAvailability = async (rowId) => {
    setBulkError(null);
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    if (!selectedBookingId) {
      setBulkError("Сначала выберите бронь рабочего места.");
      return;
    }
    if (!row.typeId) {
      handleChangeRowField(rowId, "error", "Выберите тип оборудования.");
      return;
    }

    const ints = getIntervalStrings();
    if (!ints) {
      setBulkError("Выберите дату и интервал времени.");
      return;
    }
    const { startStr, endStr } = ints;

    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, checking: true, error: null } : r
      )
    );

    try {
      const resp = await api.post(
        `/bookings/${selectedBookingId}/check-equipment-interval/`,
        {
          resource_type_id: row.typeId,
          start_datetime: startStr,
          end_datetime: endStr,
        }
      );
      const available = resp.data?.available_count ?? 0;
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, checking: false, availableCount: available }
            : r
        )
      );
    } catch (e) {
      console.error(e);
      const detail =
        e.response?.data?.detail ||
        "Ошибка проверки доступности оборудования.";
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, checking: false, error: detail } : r
        )
      );
    }
  };

  const handleSubmitBulk = async () => {
    setBulkError(null);
    setBulkSuccess(null);

    if (!selectedBookingId) {
      setBulkError("Сначала выберите бронь рабочего места.");
      return;
    }
    if (!selectedDate) {
      setBulkError("Выберите дату.");
      return;
    }

    const ints = getIntervalStrings();
    if (!ints) {
      setBulkError("Выберите интервал времени.");
      return;
    }
    const { startStr, endStr } = ints;

    const items = [];
    for (const r of rows) {
      if (!r.typeId) continue;
      const q = parseInt(r.quantity, 10) || 0;
      if (q <= 0) continue;
      items.push({
        resource_type_id: r.typeId,
        quantity: q,
      });
    }

    if (!items.length) {
      setBulkError("Добавьте хотя бы один вид оборудования.");
      return;
    }

    setBulkLoading(true);
    try {
      const resp = await api.post(
        `/bookings/${selectedBookingId}/add-equipment-interval-bulk/`,
        {
          start_datetime: startStr,
          end_datetime: endStr,
          items,
        }
      );
      console.log("BOOKED EQUIPMENT:", resp.data);
      setBulkSuccess("Оборудование успешно забронировано.");
      // при желании можно сразу перейти в карточку брони:
      // navigate(`/my-bookings/${selectedBookingId}`);
    } catch (e) {
      console.error(e);
      const detail =
        e.response?.data?.detail ||
        "Не удалось забронировать оборудование.";
      setBulkError(detail);
    } finally {
      setBulkLoading(false);
    }
  };

  // ----- рендер -----

  return (
    <div className="booking-page">
      <div className="booking-container">
        <h2 className="booking-title">Бронирование оборудования</h2>
        <p className="booking-subtitle equip-intro">
          Забронируйте несколько видов оборудования на отдельный интервал времени
          внутри уже существующей брони рабочего места. Сначала выберите бронь,
          затем укажите дату и время и добавьте нужные устройства.
        </p>

        {/* 1. Выбор брони рабочего места */}
        <section className="equip-section">
          <h3 className="equip-section-title">1. Выберите бронь рабочего места</h3>

          {bookingsLoading && (
            <p className="equip-bookings-status">Загрузка броней...</p>
          )}
          {bookingsError && (
            <p className="equip-error-inline">{bookingsError}</p>
          )}

          {!bookingsLoading && bookings.length === 0 && !bookingsError && (
            <p className="equip-bookings-status">
              У вас нет активных броней рабочего места.
            </p>
          )}

          {bookings.length > 0 && (
            <>
              <label className="equip-date-label">
                <span className="equip-field-label">Бронь</span>
                <select
                  className="equip-select equip-booking-select"
                  value={selectedBookingId}
                  onChange={(e) => {
                    setSelectedBookingId(e.target.value);
                    setBulkError(null);
                    setBulkSuccess(null);
                  }}
                >
                  <option value="">— выберите бронь —</option>
                  {bookings.map((b) => {
                    const label = `#${b.id} · ${
                      b.resource?.name || "ресурс"
                    } (${b.start_datetime.slice(
                      0,
                      16
                    )} — ${b.end_datetime.slice(0, 16)})`;
                    return (
                      <option key={b.id} value={b.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>

              {parentIntervalText && (
                <p className="equip-hint">
                  Оборудование можно бронировать только в пределах интервала:{" "}
                  <strong>{parentIntervalText.text}</strong>.
                </p>
              )}
            </>
          )}
        </section>

        {/* 2. Интервал и оборудование */}
        <section className="equip-section">
          <h3 className="equip-section-title">2. Интервал и оборудование</h3>

          {/* Дата и время */}
          <div className="equip-date-time-block">
            <div className="equip-date-label">
              <span className="equip-field-label">Дата</span>
              <input
                className="equip-input equip-input-date"
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setBulkError(null);
                  setBulkSuccess(null);
                }}
              />
            </div>

            <div className="equip-time-grid">
              <div className="equip-time-block">
                <div className="equip-field-label">Время с</div>
                <div className="equip-time-controls">
                  <select
                    className="equip-select"
                    value={startHour}
                    onChange={(e) =>
                      setStartHour(parseInt(e.target.value, 10))
                    }
                  >
                    {Array.from(
                      { length: WORKDAY_END - WORKDAY_START },
                      (_, i) => WORKDAY_START + i
                    ).map((h) => (
                      <option key={h} value={h}>
                        {pad2(h)}
                      </option>
                    ))}
                  </select>
                  <span className="equip-time-colon">:</span>
                  <select
                    className="equip-select"
                    value={startMinute}
                    onChange={(e) =>
                      setStartMinute(parseInt(e.target.value, 10))
                    }
                  >
                    {minutesOptions.map((m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="equip-time-block">
                <div className="equip-field-label">Время до</div>
                <div className="equip-time-controls">
                  <select
                    className="equip-select"
                    value={endHour}
                    onChange={(e) => setEndHour(parseInt(e.target.value, 10))}
                  >
                    {Array.from(
                      { length: WORKDAY_END - WORKDAY_START + 1 },
                      (_, i) => WORKDAY_START + i
                    ).map((h) => (
                      <option key={h} value={h}>
                        {pad2(h)}
                      </option>
                    ))}
                  </select>
                  <span className="equip-time-colon">:</span>
                  <select
                    className="equip-select"
                    value={endMinute}
                    onChange={(e) => setEndMinute(parseInt(e.target.value, 10))}
                  >
                    {minutesOptions.map((m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <p className="equip-hint">
              Интервал оборудования должен полностью входить в период брони
              рабочего места.
            </p>
          </div>

          {/* Оборудование */}
          <div className="equip-equipment-block">
            <div className="equip-section-subtitle">Оборудование</div>

            {rows.map((r) => (
              <div key={r.id} className="equip-row">
                <div className="equip-row-field">
                  <span className="equip-field-label">Тип оборудования</span>
                  <select
                    className="equip-select"
                    value={r.typeId}
                    onChange={(e) =>
                      handleChangeRowField(r.id, "typeId", e.target.value)
                    }
                  >
                    <option value="">— выберите —</option>
                    {equipmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || `Тип #${t.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="equip-row-qty">
                  <span className="equip-field-label">Количество</span>
                  <input
                    className="equip-input"
                    type="number"
                    min="1"
                    step="1"
                    value={r.quantity}
                    onChange={(e) =>
                      handleChangeRowField(r.id, "quantity", e.target.value)
                    }
                  />
                </div>

                <div className="equip-row-actions">
                  <button
                    type="button"
                    className="equip-check-btn"
                    onClick={() => handleCheckRowAvailability(r.id)}
                    disabled={r.checking}
                  >
                    {r.checking ? "Проверяем..." : "Проверить"}
                  </button>

                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="equip-row-delete"
                      onClick={() => handleRemoveRow(r.id)}
                    >
                      Убрать
                    </button>
                  )}
                </div>

                {r.availableCount !== null && !r.error && (
                  <div className="equip-row-note equip-row-note-success">
                    Свободно устройств этого типа: {r.availableCount}
                  </div>
                )}

                {r.error && (
                  <div className="equip-row-note equip-row-note-error">
                    {r.error}
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              className="equip-add-row"
              onClick={handleAddRow}
            >
              + Добавить ещё оборудование
            </button>
          </div>

          {bulkError && <div className="equip-error">{bulkError}</div>}
          {bulkSuccess && <div className="equip-success">{bulkSuccess}</div>}

          <button
            type="button"
            className="btn btn-primary booking-submit equip-submit-btn"
            onClick={handleSubmitBulk}
            disabled={bulkLoading}
          >
            {bulkLoading
              ? "Бронируем оборудование..."
              : "Забронировать выбранное оборудование"}
          </button>
        </section>

        <button onClick={() => navigate(-1)} className="back-btn">
          ← Назад
        </button>
      </div>
    </div>
  );
};

export default EquipmentBookingPage;
