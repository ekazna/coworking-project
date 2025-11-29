// src/pages/ExtendBookingPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import TimeSelect15 from "../components/TimeSelect15";
import "../styles/ExtendBookingPage.css";

const ExtendBookingPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loadingBooking, setLoadingBooking] = useState(true);
  const [bookingError, setBookingError] = useState(null);

  // Отдельно дата и время окончания
  const [desiredDate, setDesiredDate] = useState("");
  const [desiredTime, setDesiredTime] = useState("");

  const [checking, setChecking] = useState(false);
  const [options, setOptions] = useState(null);
  const [checkError, setCheckError] = useState(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState(null);
  const [confirmError, setConfirmError] = useState(null);

  // --- утилиты ---
  const formatDateTime = (dt) => {
    if (!dt) return "";
    const [datePart, timeRaw] = dt.split("T");
    if (!datePart || !timeRaw) return dt;
    const [y, m, d] = datePart.split("-");
    const timePart = timeRaw.slice(0, 5); // HH:MM
    return `${d}.${m}.${y} ${timePart}`;
  };

  const splitIsoToDateTime = (iso) => {
    if (!iso) return { date: "", time: "" };
    return {
      date: iso.slice(0, 10),
      time: iso.slice(11, 16),
    };
  };

  // --- загрузка брони ---
  useEffect(() => {
    const fetchBooking = async () => {
      setLoadingBooking(true);
      setBookingError(null);
      try {
        const resp = await api.get(`/bookings/${bookingId}/details/`);
        setBooking(resp.data);

        if (resp.data?.end_datetime) {
          const { date, time } = splitIsoToDateTime(resp.data.end_datetime);
          setDesiredDate(date);
          setDesiredTime(time);
        }
      } catch (err) {
        console.error(err);
        setBookingError("Не удалось загрузить данные бронирования.");
      } finally {
        setLoadingBooking(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  // --- проверка вариантов продления ---
  const handleCheckOptions = async (e) => {
    e.preventDefault();
    setCheckError(null);
    setOptions(null);
    setConfirmMessage(null);
    setConfirmError(null);

    if (!desiredDate) {
      setCheckError("Укажите желаемую дату окончания.");
      return;
    }
    if (!desiredTime) {
      setCheckError("Укажите желаемое время окончания.");
      return;
    }

    const [h, m] = desiredTime.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) {
      setCheckError("Некорректное время окончания.");
      return;
    }

    if (m % 15 !== 0) {
      setCheckError(
        "Время окончания должно быть с шагом 15 минут (00, 15, 30, 45)."
      );
      return;
    }

    if (h < 6 || h > 23 || (h === 23 && m > 0)) {
      setCheckError(
        "Продление возможно только в рабочие часы с 06:00 до 23:00."
      );
      return;
    }

    const desiredEndIso = `${desiredDate}T${desiredTime}:00`;

    setChecking(true);
    try {
      const resp = await api.post(`/bookings/${bookingId}/extend-options/`, {
        desired_end_datetime: desiredEndIso,
      });
      setOptions(resp.data);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.detail) {
        setCheckError(err.response.data.detail);
      } else {
        setCheckError("Не удалось проверить варианты продления.");
      }
    } finally {
      setChecking(false);
    }
  };

  // --- подтверждение продления текущей брони ---
  const handleConfirmExtend = async (newEnd) => {
    if (!newEnd) return;

    if (
      !window.confirm(
        `Подтвердить продление текущего бронирования до ${formatDateTime(
          newEnd
        )}?`
      )
    ) {
      return;
    }

    setConfirming(true);
    setConfirmError(null);
    setConfirmMessage(null);

    try {
      const resp = await api.post(`/bookings/${bookingId}/extend-confirm/`, {
        new_end_datetime: newEnd,
      });
      setConfirmMessage("Бронирование успешно продлено.");
      setBooking(resp.data);
      setOptions(null);

      if (resp.data?.end_datetime) {
        const { date, time } = splitIsoToDateTime(resp.data.end_datetime);
        setDesiredDate(date);
        setDesiredTime(time);
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.detail) {
        setConfirmError(err.response.data.detail);
      } else {
        setConfirmError("Не удалось продлить бронирование.");
      }
    } finally {
      setConfirming(false);
    }
  };

  // --- рендер при загрузке/ошибке ---
  if (loadingBooking) {
    return (
      <div className="extend-page">
        <div className="extend-container">
          <h2 className="extend-title">Продление бронирования #{bookingId}</h2>
          <p>Загрузка данных...</p>
        </div>
      </div>
    );
  }

  if (bookingError || !booking) {
    return (
      <div className="extend-page">
        <div className="extend-container">
          <h2 className="extend-title">Продление бронирования #{bookingId}</h2>
          {bookingError && <p style={{ color: "red" }}>{bookingError}</p>}
          {!booking && !bookingError && <p>Бронирование не найдено.</p>}
          <button
            className="extend-btn extend-btn-ghost"
            onClick={() => navigate(-1)}
          >
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  const sameResource = options?.same_resource;
  const sameTypeOther = options?.same_type_other_resource;
  const otherWorkspace = options?.other_workspace_resource;
  const bestPartial = options?.best_partial;

  // Показывать ли блоки 2–4
  const showOtherBlocks =
    !!options && !(sameResource && sameResource.can_full === true);

  return (
    <div className="extend-page">
      <div className="extend-container">
        <h2 className="extend-title">
          Продление бронирования #{booking.id}
        </h2>

        {/* Блок 0: текущая информация */}
        <div className="extend-card">
          <h3 className="extend-card-title">Текущая информация</h3>
          <div className="extend-main-info">
            <div className="extend-main-row">
              <span className="extend-main-label">Ресурс</span>
              <span className="extend-main-value">
                {booking.resource?.name ||
                  `Ресурс #${booking.resource?.id ?? "-"}`}
              </span>
            </div>
            <div className="extend-main-row">
              <span className="extend-main-label">Период</span>
              <span className="extend-main-value">
                {formatDateTime(booking.start_datetime)} —{" "}
                {formatDateTime(booking.end_datetime)}
              </span>
            </div>
            <div className="extend-main-row">
              <span className="extend-main-label">Статус</span>
              <span className="extend-main-value">{booking.status}</span>
            </div>
          </div>
        </div>

        {/* Блок 1: форма проверки вариантов продления */}
        <div className="extend-card">
          <h3 className="extend-card-title">Проверить возможность продления</h3>
          <form onSubmit={handleCheckOptions} className="extend-form">
            <div className="extend-form-row">
              <label className="extend-form-label">
                Желаемая дата окончания
                <input
                  type="date"
                  className="extend-input"
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                />
              </label>
            </div>

            <div className="extend-form-row">
              <div className="extend-time-wrapper">
                <TimeSelect15
                  label="Желаемое время окончания"
                  value={desiredTime}
                  onChange={setDesiredTime}
                />
              </div>
            </div>

            {checkError && (
              <p className="extend-alert-error">{checkError}</p>
            )}

            <button
              type="submit"
              className="extend-btn"
              disabled={checking}
            >
              {checking ? "Проверяем..." : "Проверить варианты продления"}
            </button>
          </form>
        </div>

        {/* Блок 2: результат проверки и варианты */}
        <div className="extend-card">
          <h3 className="extend-card-title">Результат проверки</h3>

          {!options && !checkError && (
            <p className="extend-muted">
              Укажите желаемую дату и время и нажмите
              «Проверить варианты продления».
            </p>
          )}

          {options && (
            <>
              <div className="extend-options-summary">
                <div className="extend-main-row">
                  <span className="extend-main-label">
                    Текущая дата окончания
                  </span>
                  <span className="extend-main-value">
                    {formatDateTime(options.current_end)}
                  </span>
                </div>
                <div className="extend-main-row">
                  <span className="extend-main-label">
                    Запрошенная дата окончания
                  </span>
                  <span className="extend-main-value">
                    {formatDateTime(options.requested_end)}
                  </span>
                </div>
              </div>

              {/* 1. Продление на этом же месте */}
              <div className="extend-option-block extend-option-primary">
                <h4 className="extend-option-title">
                  1. Продление на этом же рабочем месте
                </h4>
                <p
                  className={
                    sameResource?.can_full
                      ? "extend-option-text extend-option-text-success"
                      : "extend-option-text extend-option-text-fail"
                  }
                >
                  {sameResource?.reason}
                </p>

                {sameResource && (
                  <p className="extend-option-text">
                    Максимально возможная дата окончания на этом месте:{" "}
                    <strong>
                      {formatDateTime(sameResource.max_end)}
                    </strong>
                  </p>
                )}

                {sameResource &&
                  sameResource.max_end > options.current_end && (
                    <div className="extend-option-actions">
                      {sameResource.can_full && (
                        <button
                          type="button"
                          className="extend-btn"
                          disabled={confirming}
                          onClick={() =>
                            handleConfirmExtend(options.requested_end)
                          }
                        >
                          Продлить до запрошенного времени
                        </button>
                      )}

                      {!sameResource.can_full && (
                        <button
                          type="button"
                          className="extend-btn extend-btn-secondary"
                          disabled={confirming}
                          onClick={() =>
                            handleConfirmExtend(sameResource.max_end)
                          }
                        >
                          Продлить на этом месте до{" "}
                          {formatDateTime(sameResource.max_end)}
                        </button>
                      )}
                    </div>
                  )}
              </div>

              {/* Блоки 2–4 показываем только если нет полного продления на том же месте */}
              {showOtherBlocks && (
                <>
                  {/* 2. Другое место того же типа */}
                  <div className="extend-option-block">
                    <h4 className="extend-option-title">
                      2. Другое рабочее место того же типа
                    </h4>
                    <p className="extend-option-text">
                      {sameTypeOther?.reason || "Нет данных."}
                    </p>

                    {sameTypeOther?.can_any && (
                      <>
                        <p className="extend-option-text">
                          Рекомендованный ресурс:{" "}
                          <strong>
                            {sameTypeOther.resource_name ||
                              `Ресурс #${sameTypeOther.resource_id}`}
                          </strong>
                          .
                        </p>
                        <p className="extend-option-text">
                          Максимально возможная дата окончания на нём:{" "}
                          <strong>
                            {formatDateTime(sameTypeOther.max_end)}
                          </strong>
                        </p>

                        <button
                          type="button"
                          className="extend-btn extend-btn-secondary"
                          onClick={() => {
                            if (sameTypeOther?.resource_id) {
                              const resId = sameTypeOther.resource_id;

                              const d = options.requested_end.slice(0, 10);
                              const t = options.current_end.slice(11, 16);
                              const t2 =
                                options.requested_end.slice(11, 16);

                              navigate(`/bookings/workspace/${resId}`, {
                                state: {
                                  date: d,
                                  startTime: t,
                                  endTime: t2,
                                  mode: "hours",
                                  isFromExtension: true,
                                },
                              });
                            }
                          }}
                        >
                          Продлить на другом рабочем месте
                        </button>
                      </>
                    )}
                  </div>

                  {/* 3. Место другого типа */}
                  <div className="extend-option-block">
                    <h4 className="extend-option-title">
                      3. Продление на рабочем месте другого типа
                    </h4>
                    <p className="extend-option-text">
                      {otherWorkspace?.reason || "Нет данных."}
                    </p>

                    {otherWorkspace?.can_any && (
                      <>
                        <p className="extend-option-text">
                          Возможный ресурс:{" "}
                          <strong>
                            {otherWorkspace.resource_name ||
                              `Ресурс #${otherWorkspace.resource_id}`}
                          </strong>
                          .
                        </p>
                        <p className="extend-option-text">
                          Максимально возможная дата окончания:{" "}
                          <strong>
                            {formatDateTime(otherWorkspace.max_end)}
                          </strong>
                        </p>

                        <button
                          type="button"
                          className="extend-btn extend-btn-secondary"
                          onClick={() => {
                            if (otherWorkspace?.resource_id) {
                              const resId = otherWorkspace.resource_id;

                              const d = options.requested_end.slice(0, 10);
                              const t = options.current_end.slice(11, 16);
                              const t2 =
                                options.requested_end.slice(11, 16);

                              navigate(`/bookings/workspace/${resId}`, {
                                state: {
                                  date: d,
                                  startTime: t,
                                  endTime: t2,
                                  mode: "hours",
                                  isFromExtension: true,
                                },
                              });
                            }
                          }}
                        >
                          Забронировать другое рабочее место
                        </button>
                      </>
                    )}
                  </div>

                  {/* 4. Лучший частичный вариант */}
                  <div className="extend-option-block">
                    <h4 className="extend-option-title">
                      4. Лучший частичный вариант
                    </h4>

                    {!bestPartial?.exists && (
                      <p className="extend-option-text">
                        Нет вариантов даже для частичного продления. Попробуйте
                        выбрать более короткий интервал.
                      </p>
                    )}

                    {bestPartial?.exists && (
                      <>
                        <p className="extend-option-text">
                          Максимально возможная дата окончания:{" "}
                          <strong>
                            {formatDateTime(bestPartial.max_end)}
                          </strong>
                        </p>
                        <p className="extend-option-text">
                          Источник:{" "}
                          {bestPartial.source === "same_resource"
                            ? "текущее рабочее место"
                            : bestPartial.source ===
                              "same_type_other_resource"
                            ? "другое рабочее место того же типа"
                            : "рабочее место другого типа"}
                          .
                        </p>
                        {bestPartial.resource_id && (
                          <p className="extend-option-text">
                            Ресурс:{" "}
                            <strong>
                              {bestPartial.resource_name ||
                                `Ресурс #${bestPartial.resource_id}`}
                            </strong>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {confirmError && (
            <p className="extend-alert-error extend-mt">
              {confirmError}
            </p>
          )}
          {confirmMessage && (
            <p className="extend-alert-success extend-mt">
              {confirmMessage}
            </p>
          )}
        </div>

        <button
          className="extend-btn extend-btn-ghost"
          onClick={() => navigate(-1)}
        >
          ← Назад
        </button>
      </div>
    </div>
  );
};

export default ExtendBookingPage;
