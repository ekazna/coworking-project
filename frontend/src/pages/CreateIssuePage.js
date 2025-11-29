// src/pages/CreateIssuePage.js
import React, { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api";

const CreateIssuePage = () => {
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const resourceId = searchParams.get("resourceId");

  const [problemType, setProblemType] = useState("workspace"); // workspace | equipment
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!description.trim()) {
      setError("Пожалуйста, опишите проблему");
      return;
    }

    const payload = {
      issue_type: problemType,          // <- важно
      description: description.trim(),
      booking_id: Number(bookingId),    // <- booking_id, а не booking
    };

    if (resourceId) {
      payload.resource_id = Number(resourceId);  // <- resource_id, если есть
    }

    setSubmitting(true);
    try {
      const response = await api.post("/issues/", payload);
      setSuccess("Обращение успешно отправлено");
      console.log("ISSUE CREATED:", response.data);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        setError(
          `Ошибка при создании обращения: ${JSON.stringify(
            err.response.data
          )}`
        );
      } else {
        setError("Не удалось отправить обращение");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 10px" }}>
      <h2>Сообщить о проблеме по бронированию #{bookingId}</h2>

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid #ddd",
          borderRadius: 4,
          padding: 16,
          marginTop: 16,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <label>
            Тип проблемы:
            <select
              value={problemType}
              onChange={(e) => setProblemType(e.target.value)}
              style={{ marginLeft: 8 }}
            >
              <option value="workspace">Проблема с рабочим местом</option>
              <option value="equipment">Проблема с оборудованием</option>
            </select>
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Описание проблемы:
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            style={{ width: "100%" }}
            placeholder="Опишите, что случилось…"
          />
        </div>

        {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
        {success && <p style={{ color: "green", marginTop: 8 }}>{success}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Отправляем..." : "Отправить обращение"}
        </button>
      </form>

      <button
        style={{ marginTop: 16 }}
        onClick={() => navigate(`/my-bookings/${bookingId}`)}
      >
        ← Назад к бронированию
      </button>
    </div>
  );
};

export default CreateIssuePage;
