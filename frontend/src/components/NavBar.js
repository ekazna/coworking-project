// src/components/NavBar.js
import React, { useContext, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../AuthContext";
import "../styles/NavBar.css";

const NavBar = () => {
  const { isAuthenticated, isAdmin, user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  const [bookingMenuOpen, setBookingMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;

  // --- CLIENT NAV ---
  const renderClientNav = () => (
    <>
      <Link className={`nav-link ${isActive("/") ? "active" : ""}`} to="/">
        Главная
      </Link>

      <div
        className="nav-dropdown"
        onMouseEnter={() => setBookingMenuOpen(true)}
        onMouseLeave={() => setBookingMenuOpen(false)}
      >
        <span className="nav-dropdown-title">Бронирование ▾</span>

        {bookingMenuOpen && (
          <div className="nav-dropdown-menu">
            <Link to="/bookings/workspace" className="dropdown-item">
              Рабочее место
            </Link>
            <Link to="/bookings/equipment" className="dropdown-item">
              Оборудование
            </Link>
          </div>
        )}
      </div>
    </>
  );

  // --- PROFILE MENU ---
  const renderProfileMenu = () => {
    if (!isAuthenticated) {
      return (
        <Link className="nav-link" to="/login">
          Войти / Зарегистрироваться
        </Link>
      );
    }

    // Админ
    if (isAdmin) {
      return (
        <div className="nav-profile">
          <span className="nav-username">
            Админ: {user?.username || "user"}
          </span>
          <button className="nav-btn" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      );
    }

    // Клиент
    return (
      <div
        className="nav-dropdown profile-dropdown"
        onMouseEnter={() => setProfileMenuOpen(true)}
        onMouseLeave={() => setProfileMenuOpen(false)}
      >
        <span className="nav-dropdown-title">
          {user?.username || "Профиль"} ▾
        </span>

        {profileMenuOpen && (
          <div className="nav-dropdown-menu right">
            <Link to="/profile" className="dropdown-item">
              Мой профиль
            </Link>
            <Link to="/profile/bookings" className="dropdown-item">
              Мои брони
            </Link>
            <button className="dropdown-item" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        )}
      </div>
    );
  };

  // --- ADMIN NAV ---
  const renderAdminNav = () => (
    <>
      <Link className="nav-link" to="/admin/dashboard">Аналитика</Link>
      <Link className="nav-link" to="/admin/bookings">Брони</Link>
      <Link className="nav-link" to="/admin/issues">Поломки</Link>
      <Link className="nav-link" to="/admin/resources">Оборудование</Link>
      <Link className="nav-link" to="/admin/clients">Клиенты</Link>
    </>
  );

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-logo">
          Coworking
        </Link>
      </div>

      <div className="navbar-center">
        {isAuthenticated && isAdmin ? renderAdminNav() : renderClientNav()}
      </div>

      <div className="navbar-right">{renderProfileMenu()}</div>
    </nav>
  );
};

export default NavBar;
