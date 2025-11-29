// src/components/TimeSelect15.js
import React, { useState, useEffect } from "react";

const TimeSelect15 = ({ label, value, onChange }) => {
  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0")
  );
  const minutes = ["00", "15", "30", "45"];

  // Локальное состояние, чтобы селекты показывали выбранное,
  // даже если родитель пока хранит пустую строку.
  const [localHour, setLocalHour] = useState("");
  const [localMinute, setLocalMinute] = useState("");

  // Синхронизируем локальное состояние с value, если оно меняется снаружи
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":");
      setLocalHour(h || "");
      setLocalMinute(m || "");
    } else {
      setLocalHour("");
      setLocalMinute("");
    }
  }, [value]);

  const propagateIfComplete = (hour, minute) => {
    if (hour && minute) {
      onChange(`${hour}:${minute}`);
    } else {
      // ещё не выбраны обе части времени
      onChange("");
    }
  };

  const handleHourChange = (e) => {
    const newHour = e.target.value;
    setLocalHour(newHour);
    propagateIfComplete(newHour, localMinute);
  };

  const handleMinuteChange = (e) => {
    const newMinute = e.target.value;
    setLocalMinute(newMinute);
    propagateIfComplete(localHour, newMinute);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      {label && (
        <div style={{ marginBottom: 4 }}>
          <label>{label}</label>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select value={localHour} onChange={handleHourChange}>
          <option value="">--</option>
          {hours.map((hh) => (
            <option key={hh} value={hh}>
              {hh}
            </option>
          ))}
        </select>

        <span>:</span>

        <select value={localMinute} onChange={handleMinuteChange}>
          <option value="">--</option>
          {minutes.map((mm) => (
            <option key={mm} value={mm}>
              {mm}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default TimeSelect15;
