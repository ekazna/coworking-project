import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import "../../styles/AdminResourcesPage.css";

function AdminResourcesPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [resources, setResources] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const [editingResource, setEditingResource] = useState(null); // {} = создаём, объект = редактируем
  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "",
    capacity: "",
    status: "active",
  });

  // --- Загрузка данных с бэкенда ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const [catRes, typeRes, resRes] = await Promise.all([
          api.get("/resource-categories/"),
          api.get("/resource-types/"),
          api.get("/resources/"),
        ]);

        setCategories(catRes.data || []);
        setTypes(typeRes.data || []);
        setResources(resRes.data || []);
      } catch (e) {
        console.error("Ошибка при загрузке ресурсов:", e);
        setError("Не удалось загрузить данные с сервера");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // --- Фильтрация ресурсов на фронте ---
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const typeId = r.type?.id;
      const categoryId = r.type?.category?.id;

      const byCategory =
        !selectedCategory || String(categoryId) === String(selectedCategory);
      const byType =
        !selectedType || String(typeId) === String(selectedType);

      return byCategory && byType;
    });
  }, [resources, selectedCategory, selectedType]);

  // --- Работа с формой ---
  const openCreateForm = () => {
    setEditingResource({});
    setForm({
      name: "",
      description: "",
      type: types[0]?.id || "",
      capacity: "",
      status: "active",
    });
  };



  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // --- Сохранение (create / update) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        name: form.name,
        description: form.description,
        type_id: form.type ? Number(form.type) : null,
        capacity: form.capacity ? Number(form.capacity) : null,
        status: form.status,
      };

      let resp;
      if (editingResource && editingResource.id) {
        resp = await api.put(`/resources/${editingResource.id}/`, payload);
      } else {
        resp = await api.post("/resources/", payload);
      }

      const saved = resp.data;

      if (editingResource && editingResource.id) {
        setResources((prev) =>
          prev.map((r) => (r.id === saved.id ? saved : r))
        );
      } else {
        setResources((prev) => [...prev, saved]);
      }

      setEditingResource(null);
    } catch (e) {
      console.error(
        "Ошибка при сохранении ресурса:",
        e.response?.data || e.message
      );
      const serverMsg =
        (e.response && JSON.stringify(e.response.data)) ||
        "Ошибка при сохранении ресурса";
      setError(serverMsg);
    }
  };

  // --- Удаление ресурса ---
  const handleDelete = async (resource) => {
    if (!window.confirm(`Удалить ресурс "${resource.name}"?`)) return;

    try {
      await api.delete(`/resources/${resource.id}/`);
      setResources((prev) => prev.filter((r) => r.id !== resource.id));
      if (editingResource?.id === resource.id) {
        setEditingResource(null);
      }
    } catch (e) {
      console.error("Ошибка при удалении ресурса:", e.response?.data || e);
      setError("Ошибка при удалении ресурса");
    }
  };

  const renderStatusBadge = (status) => {
    let label = "—";
    if (status === "active") label = "Активен";
    else if (status === "broken") label = "Неисправен";
    else if (status === "maintenance") label = "На обслуживании";
    else if (status) label = status;

    return (
      <span className={`resource-status-badge resource-status-${status}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="admin-resources-page">
      <div className="admin-resources-container">
        {/* Шапка */}
        <div className="admin-resources-header">
          <h2 className="admin-resources-title">Ресурсы коворкинга</h2>
          <button
            type="button"
            className="admin-btn"
            onClick={openCreateForm}
          >
            + Добавить ресурс
          </button>
        </div>

        {error && (
          <p className="admin-alert-error" style={{ whiteSpace: "pre-wrap" }}>
            {error}
          </p>
        )}
        {loading && <p className="admin-muted">Загрузка...</p>}

        {/* Форма создания / редактирования */}
        {editingResource !== null && (
          <div className="admin-card admin-resources-form-card">
            <h3 className="admin-card-title">
              {editingResource.id ? "Редактирование ресурса" : "Новый ресурс"}
            </h3>

            <form onSubmit={handleSubmit} className="admin-resources-form">
              <div className="admin-form-row">
                <label className="admin-form-label">Название</label>
                <input
                  type="text"
                  name="name"
                  className="admin-input"
                  value={form.name}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div className="admin-form-row">
                <label className="admin-form-label">Описание</label>
                <textarea
                  name="description"
                  className="admin-input admin-input-textarea"
                  value={form.description}
                  onChange={handleFormChange}
                />
              </div>

              <div className="admin-form-row admin-form-row-inline">
                <div className="admin-form-col">
                  <label className="admin-form-label">Тип ресурса</label>
                  <select
                    name="type"
                    className="admin-select"
                    value={form.type}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="" disabled>
                      Выберите тип
                    </option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.category && ` (${t.category.name || "категория"})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-col">
                  <label className="admin-form-label">
                    Вместимость (опционально)
                  </label>
                  <input
                    type="number"
                    name="capacity"
                    className="admin-input"
                    value={form.capacity}
                    onChange={handleFormChange}
                    min="0"
                  />
                </div>

                <div className="admin-form-col">
                  <label className="admin-form-label">Статус</label>
                  <select
                    name="status"
                    className="admin-select"
                    value={form.status}
                    onChange={handleFormChange}
                  >
                    <option value="active">Активен</option>
                    <option value="broken">Неисправен</option>
                    <option value="maintenance">На обслуживании</option>
                  </select>
                </div>
              </div>

              <div className="admin-form-actions">
                <button type="submit" className="admin-btn">
                  {editingResource.id ? "Сохранить" : "Создать"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setEditingResource(null)}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Фильтры */}
        <div className="admin-card admin-resources-filters">
          <div className="admin-issues-filters-row">
            <div className="admin-filter-label">
              <span>Категория</span>
              <select
                className="admin-select"
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setSelectedType("");
                }}
              >
                <option value="">Все</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-filter-label">
              <span>Тип ресурса</span>
              <select
                className="admin-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="">Все</option>
                {types
                  .filter((t) =>
                    selectedCategory
                      ? String(t.category?.id) === String(selectedCategory)
                      : true
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Таблица ресурсов */}
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Категория</th>
                <th>Тип</th>
                <th>Вместимость</th>
                <th>Статус</th>
                <th className="admin-table-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center" }}>
                    Ресурсы не найдены
                  </td>
                </tr>
              ) : (
                filteredResources.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.name}</td>
                    <td>{r.type?.category?.name || "—"}</td>
                    <td>{r.type?.name || `#${r.type?.id ?? ""}`}</td>
                    <td>{r.capacity ?? "—"}</td>
                    <td>{renderStatusBadge(r.status)}</td>
                    <td className="admin-table-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn-small admin-btn-secondary"
                        onClick={() => navigate(`/admin/resources/${r.id}`)}
                      >
                        Открыть
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-small admin-btn-danger"
                        onClick={() => handleDelete(r)}
                      >
                        Удалить
                      </button>
                      
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AdminResourcesPage;
