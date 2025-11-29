import React, { useEffect, useState, useMemo } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import api from "../api";
import TimeSelect15 from "../components/TimeSelect15";
import "../styles/WorkspaceBookingDetailPage.css";

// Хелпер: оставляем только оборудование, отсекаем рабочие места и прочее
const filterEquipmentTypes = (all) =>
  (all || []).filter((t) => {
    const cat = t.category;
    if (cat && typeof cat === "object") {
      const code = (cat.code || "").toLowerCase();
      const name = (cat.name || "").toLowerCase();

      // явная категория "equipment"
      if (code === "equipment" || name.includes("оборуд")) return true;
      // явная категория "workspace" — отбрасываем
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

    // по умолчанию — не считаем оборудованием
    return false;
  });

// безопасное превращение Decimal/строки в число
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const WorkspaceBookingDetailPage = ({ bookingType = "workspace" }) => {
  const { resourceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialState = location.state || {};

  // флаги для фиксированных рабочих мест
  const isFixed = initialState.isFixed || false;
  const resourceTypeId = initialState.resourceTypeId || null;
  const resourceTypeName =
    initialState.resourceTypeName || "Фиксированное рабочее место";

  const [resource, setResource] = useState(null);
  const [tariffType, setTariffType] = useState(null); // ResourceType с тарифами
  const [loadingResource, setLoadingResource] = useState(true);
  const [errorResource, setErrorResource] = useState(null);

  const [mode, setMode] = useState(initialState.mode || "hours");
  const [dateFrom, setDateFrom] = useState(initialState.date || "");
  const [startTime, setStartTime] = useState(initialState.startTime || "");
  const [endTime, setEndTime] = useState(initialState.endTime || "");

  // --- оборудование при создании брони ---
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [equipmentRows, setEquipmentRows] = useState([
    { resourceTypeId: "", quantity: 1 },
  ]);
  const [equipmentError, setEquipmentError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const isEquipment = bookingType === "equipment";
  const bookingLabel = isEquipment ? "оборудования" : "рабочего места";

  // 1. Загрузка ресурса / типа ресурса
  useEffect(() => {
    const load = async () => {
      if (isFixed) {
        // для фиксированного места показываем только тип,
        // а тарифы берём из /resource-types/:id/
        setResource({ name: resourceTypeName });
        setLoadingResource(false);
        setErrorResource(null);

        if (resourceTypeId) {
          try {
            const resp = await api.get(`/resource-types/${resourceTypeId}/`);
            setTariffType(resp.data);
          } catch (err) {
            console.error("Ошибка загрузки типа рабочего места", err);
          }
        }
        return;
      }

      setLoadingResource(true);
      setErrorResource(null);
      try {
        const response = await api.get(`/resources/${resourceId}/`);
        setResource(response.data);
        if (response.data.type) {
          setTariffType(response.data.type);
        }
      } catch (err) {
        console.error(err);
        setErrorResource(`Не удалось загрузить информацию о ${bookingLabel}`);
      } finally {
        setLoadingResource(false);
      }
    };

    load();
  }, [resourceId, bookingLabel, isFixed, resourceTypeName, resourceTypeId]);

  // 1.1. Загрузка типов ресурсов-ОБОРУДОВАНИЯ
  useEffect(() => {
    const fetchEquipmentTypes = async () => {
      try {
        const resp = await api.get("/resource-types/");
        const all = resp.data || [];
        const equipmentOnly = filterEquipmentTypes(all);
        setEquipmentTypes(equipmentOnly);
      } catch (err) {
        console.error("Ошибка загрузки типов оборудования", err);
        setEquipmentTypes([]);
      }
    };

    fetchEquipmentTypes();
  }, []);

  // 2. Дата окончания для месячной брони
  const monthEndDate = useMemo(() => {
    if (!dateFrom) return "";
    try {
      const d = new Date(dateFrom);
      if (Number.isNaN(d.getTime())) return "";
      const end = new Date(d);
      end.setMonth(end.getMonth() + 1);

      const year = end.getFullYear();
      const month = String(end.getMonth() + 1).padStart(2, "0");
      const day = String(end.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return "";
    }
  }, [dateFrom]);

  // 2.1. Длительность в часах для почасовой брони (для расчёта цены)
  const durationHours = useMemo(() => {
    if (mode !== "hours" || !startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const start = sh + (sm || 0) / 60;
    const end = eh + (em || 0) / 60;
    const diff = end - start;
    return diff > 0 ? diff : 0;
  }, [mode, startTime, endTime]);

  // 2.2. Стоимость рабочего места
  const mainPrice = useMemo(() => {
    if (!tariffType) return 0;

    const hourly = toNumber(tariffType.hourly_rate);
    const daily = toNumber(tariffType.daily_rate);
    const monthly = toNumber(tariffType.monthly_rate);

    if (mode === "hours") {
      return hourly * durationHours;
    }
    if (mode === "day") {
      return daily;
    }
    if (mode === "month") {
      return monthly;
    }
    return 0;
  }, [tariffType, mode, durationHours]);

  // 2.3. Стоимость выбранного оборудования
  const equipmentPrice = useMemo(() => {
    if (equipmentTypes.length === 0 || isEquipment) return 0;

    return equipmentRows.reduce((total, row) => {
      if (!row.resourceTypeId) return total;

      const type = equipmentTypes.find(
        (t) => String(t.id) === String(row.resourceTypeId)
      );
      if (!type) return total;

      const qty = Number(row.quantity) || 0;
      if (qty <= 0) return total;

      const hourly = toNumber(type.hourly_rate);
      const daily = toNumber(type.daily_rate);
      const monthly = toNumber(type.monthly_rate);

      let perUnit = 0;
      if (mode === "hours") {
        perUnit = hourly * durationHours;
      } else if (mode === "day") {
        perUnit = daily;
      } else if (mode === "month") {
        perUnit = monthly;
      }

      return total + perUnit * qty;
    }, 0);
  }, [equipmentRows, equipmentTypes, mode, durationHours, isEquipment]);

  const totalPrice = useMemo(
    () => mainPrice + equipmentPrice,
    [mainPrice, equipmentPrice]
  );

  const formatMoney = (value) => `${Math.round(value)} ₽`;

  // 3. Управление строками оборудования
  const handleEquipmentRowChange = (index, field, value) => {
    setEquipmentRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleAddEquipmentRow = () => {
    setEquipmentRows((prev) => [...prev, { resourceTypeId: "", quantity: 1 }]);
  };

  const handleRemoveEquipmentRow = (index) => {
    setEquipmentRows((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index)
    );
  };

  // 4. Сборка дат/времени
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

      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);

      if (sm % 15 !== 0 || em % 15 !== 0) {
        throw new Error(
          "Время начала и окончания должно быть с шагом 15 минут (00, 15, 30, 45)."
        );
      }

      // рабочие часы: 06:00–23:00
      if (sh < 6 || eh > 23 || (eh === 23 && em > 0)) {
        throw new Error(
          "Бронировать можно только в рабочие часы с 06:00 до 23:00"
        );
      }

      const start = `${dateFrom}T${startTime}:00`;
      const end = `${dateFrom}T${endTime}:00`;
      return { start, end, time_format: "hour" };
    }

    if (mode === "day") {
      const start = `${dateFrom}T06:00:00`;
      const end = `${dateFrom}T23:00:00`;
      return { start, end, time_format: "day" };
    }

    if (mode === "month") {
      if (!monthEndDate) {
        throw new Error("Не удалось вычислить дату окончания месячной брони");
      }
      const start = `${dateFrom}T06:00:00`;
      const end = `${monthEndDate}T23:00:00`;
      return { start, end, time_format: "month" };
    }

    throw new Error("Неизвестный формат бронирования");
  };

  // Подготовка списка оборудования
  const buildEquipmentList = () => {
    const list = [];
    for (const row of equipmentRows) {
      if (!row.resourceTypeId) continue;
      const qty = Number(row.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(
          "Количество оборудования должно быть положительным целым числом"
        );
      }
      list.push({
        resource_type_id: Number(row.resourceTypeId),
        quantity: qty,
      });
    }
    return list;
  };

  // 5. Отправка на backend
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setEquipmentError(null);

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

    let equipmentList = [];
    try {
      equipmentList = buildEquipmentList();
    } catch (err) {
      setEquipmentError(err.message);
      return;
    }

    // 5.1. Предварительная проверка доступности оборудования
    if (equipmentList.length > 0) {
      try {
        await api.post("/bookings/check-equipment-availability/", {
          start_datetime: start,
          end_datetime: end,
          equipment: equipmentList,
        });
      } catch (err) {
        console.error(err);

        let message =
          "Не удалось проверить доступность оборудования. Попробуйте ещё раз.";

        if (err.response && err.response.data) {
          const data = err.response.data;

          if (typeof data.detail === "string") {
            message = data.detail;
          } else if (Array.isArray(data.detail)) {
            message = data.detail.join(" ");
          } else if (typeof data.detail === "object" && data.detail !== null) {
            message = Object.values(data.detail)
              .filter(Boolean)
              .join(" ");
          }
        }

        setSubmitError(message);
        return;
      }
    }

    // 5.2. Создание брони рабочего места
    setSubmitting(true);
    try {
      let bookingResp;

      if (isFixed) {
        if (!resourceTypeId) {
          throw new Error(
            "Не удалось определить тип рабочего места для бронирования."
          );
        }

        bookingResp = await api.post("/bookings/create-fixed/", {
          resource_type_id: resourceTypeId,
          time_format,
          start_datetime: start,
          end_datetime: end,
        });
      } else {
        bookingResp = await api.post("/bookings/", {
          resource_id: Number(resourceId),
          booking_type: bookingType,
          time_format,
          start_datetime: start,
          end_datetime: end,
        });
      }

      const createdBooking = bookingResp.data;
      const createdBookingId = createdBooking?.id;

      // 5.3. Если указано оборудование — добавляем его к созданной брони
      if (createdBookingId && equipmentList.length > 0) {
        for (const item of equipmentList) {
          await api.post(`/bookings/${createdBookingId}/add-equipment/`, {
            resource_type_id: item.resource_type_id,
            quantity: item.quantity,
          });
        }
      }

      setSubmitSuccess("Бронирование успешно создано");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setSubmitError(
          `Ошибка при создании бронирования: ${JSON.stringify(
            err.response.data
          )}`
        );
      } else {
        setSubmitError("Не удалось создать бронирование");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatMonthEndLabel = () => {
    if (!monthEndDate) return "";
    return monthEndDate;
  };

  return (
    <div className="wb-detail-page">
      <div className="wb-detail-container">
        <h2 className="wb-detail-title">
          Оформление бронирования {bookingLabel}
        </h2>

        {/* Информация о ресурсе / типе ресурса */}
        <div className="wb-card wb-card-resource">
          {loadingResource && (
            <p className="wb-muted">
              Загрузка информации о {bookingLabel}...
            </p>
          )}
          {errorResource && (
            <p className="wb-alert-error">{errorResource}</p>
          )}
          {resource && (
            <>
              <h3 className="wb-card-subtitle">
                {resource.name ||
                  (isEquipment
                    ? `Оборудование #${resource.id}`
                    : isFixed
                    ? "Фиксированное рабочее место"
                    : `Рабочее место #${resource.id}`)}
              </h3>

              <div className="wb-resource-meta">
                {!isFixed && resource.zone && (
                  <div className="wb-meta-item">
                    <span className="wb-meta-label">Зона</span>
                    <span className="wb-meta-value">{resource.zone}</span>
                  </div>
                )}

                {!isFixed &&
                  typeof resource.capacity !== "undefined" && (
                    <div className="wb-meta-item">
                      <span className="wb-meta-label">Вместимость</span>
                      <span className="wb-meta-value">
                        {resource.capacity}
                      </span>
                    </div>
                  )}
              </div>

              {!isFixed && resource.description && (
                <p className="wb-resource-description">
                  {resource.description}
                </p>
              )}

              {isFixed && (
                <p className="wb-muted">
                  Конкретное рабочее место будет автоматически подобрано
                  системой, исходя из занятости столов.
                </p>
              )}
            </>
          )}
        </div>

        {/* Форма бронирования */}
        <form className="wb-card wb-card-form" onSubmit={handleSubmit}>
          <h3 className="wb-card-subtitle">Параметры бронирования</h3>

          <div className="wb-form-grid">
            <div className="wb-form-field">
              <label className="wb-form-label">Дата начала</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="wb-input"
              />
            </div>

            <div className="wb-form-field wb-form-field-wide">
              <span className="wb-form-label">Формат бронирования</span>
              <div className="wb-radio-row">
                <label className="wb-radio-label">
                  <input
                    type="radio"
                    value="hours"
                    checked={mode === "hours"}
                    onChange={() => setMode("hours")}
                  />
                  <span>Часы</span>
                </label>
                <label className="wb-radio-label">
                  <input
                    type="radio"
                    value="day"
                    checked={mode === "day"}
                    onChange={() => setMode("day")}
                  />
                  <span>День</span>
                </label>
                <label className="wb-radio-label">
                  <input
                    type="radio"
                    value="month"
                    checked={mode === "month"}
                    onChange={() => setMode("month")}
                  />
                  <span>Месяц</span>
                </label>
              </div>
            </div>
          </div>

          {mode === "hours" && (
            <div className="wb-time-row">
              <div className="wb-form-field">
                <TimeSelect15
                  label="Время с"
                  value={startTime}
                  onChange={setStartTime}
                />
              </div>
              <div className="wb-form-field">
                <TimeSelect15
                  label="Время до"
                  value={endTime}
                  onChange={setEndTime}
                />
              </div>
            </div>
          )}

          {mode === "month" && (
            <div className="wb-form-field wb-form-field-month">
              <label className="wb-form-label">
                Дата окончания (автоматически)
              </label>
              <input
                type="date"
                value={formatMonthEndLabel()}
                readOnly
                className="wb-input wb-input-readonly"
              />
            </div>
          )}

          {/* Блок оборудования при создании брони */}
          {!isEquipment && (
            <div className="wb-equipment-block">
              <h3 className="wb-card-subtitle">
                Добавить оборудование (опционально)
              </h3>

              {equipmentTypes.length === 0 && (
                <p className="wb-muted">
                  Типы оборудования недоступны или не настроены.
                </p>
              )}

              {equipmentTypes.length > 0 && (
                <>
                  {equipmentRows.map((row, index) => (
                    <div className="wb-eq-row" key={index}>
                      <div className="wb-eq-type">
                        <label className="wb-form-label">
                          Тип оборудования
                        </label>
                        <select
                          className="wb-input"
                          value={row.resourceTypeId}
                          onChange={(e) =>
                            handleEquipmentRowChange(
                              index,
                              "resourceTypeId",
                              e.target.value
                            )
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

                      <div className="wb-eq-qty">
                        <label className="wb-form-label">Кол-во</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.quantity}
                          onChange={(e) =>
                            handleEquipmentRowChange(
                              index,
                              "quantity",
                              e.target.value
                            )
                          }
                          className="wb-input"
                        />
                      </div>

                      <button
                        type="button"
                        className="wb-btn-tertiary wb-eq-remove"
                        onClick={() => handleRemoveEquipmentRow(index)}
                        disabled={equipmentRows.length === 1}
                      >
                        Убрать
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="wb-btn-ghost"
                    onClick={handleAddEquipmentRow}
                  >
                    + Добавить ещё тип оборудования
                  </button>
                </>
              )}

              {equipmentError && (
                <p className="wb-alert-error">{equipmentError}</p>
              )}

              <p className="wb-muted wb-eq-hint">
                Оборудование добавляется на весь период бронирования. Перед
                созданием заявки система проверит наличие свободных устройств и
                не создаст бронь, если какого-то оборудования не хватает.
              </p>
            </div>
          )}

          {/* Блок с расчётом стоимости */}
          <div className="wb-price-summary">
            <div className="wb-price-row">
              <span className="wb-price-label">
                Стоимость рабочего места:
              </span>
              <span className="wb-price-value">
                {mainPrice > 0 && dateFrom
                  ? formatMoney(mainPrice)
                  : "— (тариф не настроен / не выбрано время)"}
              </span>
            </div>

            {!isEquipment && (
              <div className="wb-price-row">
                <span className="wb-price-label">
                  Стоимость выбранного оборудования:
                </span>
                <span className="wb-price-value">
                  {equipmentPrice > 0 ? formatMoney(equipmentPrice) : "0 ₽"}
                </span>
              </div>
            )}

            <div className="wb-price-row wb-price-row-total">
              <span className="wb-price-label">
                Итого к оплате (предварительно):
              </span>
              <span className="wb-price-value">
                {totalPrice > 0 && dateFrom ? formatMoney(totalPrice) : "—"}
              </span>
            </div>

            <p className="wb-price-hint">
              Итоговая сумма рассчитывается по тарифам за час / день / месяц и
              может незначительно отличаться при изменении тарифов или
              округлении. Фактическая оплата будет выполнена на следующем шаге.
            </p>
          </div>

          {submitError && <p className="wb-alert-error">{submitError}</p>}
          {submitSuccess && (
            <p className="wb-alert-success">{submitSuccess}</p>
          )}

          <div className="wb-actions-row">
            <button
              type="submit"
              className="wb-btn-primary"
              disabled={submitting || loadingResource || !resource}
            >
              {submitting
                ? "Создаём бронирование..."
                : "Подтвердить бронирование"}
            </button>

            <button
              type="button"
              className="wb-btn-secondary"
              onClick={() => navigate(-1)}
            >
              Назад к выбору
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WorkspaceBookingDetailPage;
