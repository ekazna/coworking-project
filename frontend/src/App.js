// src/App.js
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { AuthProvider } from "./AuthContext";
import NavBar from "./components/NavBar";

import { ProtectedRoute, AdminRoute } from "./routeGuards";

import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import MyBookingsPage from "./pages/MyBookingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import WorkspaceBookingPage from "./pages/WorkspaceBookingPage";
import WorkspaceBookingDetailPage from "./pages/WorkspaceBookingDetailPage";
import BookingDetailPage from "./pages/BookingDetailPage";
import AdminBookingsPage from "./pages/admin/AdminBookingsPage";
import AdminBookingDetailPage from "./pages/admin/AdminBookingDetailPage";
import AdminIssuesPage from "./pages/admin/AdminIssuesPage";
import CreateIssuePage from "./pages/CreateIssuePage";
import AdminClientsPage from "./pages/admin/AdminClientsPage";
import AdminResourcesPage from "./pages/admin/AdminResourcesPage";
import AdminCreateBookingPage from "./pages/admin/AdminCreateBookingPage";
import EquipmentBookingPage from "./pages/EquipmentBookingPage";
import ExtendBookingPage from "./pages/ExtendBookingPage";
import ProfilePage from "./pages/MyProfilePage";
import AdminClientDetailPage from "./pages/admin/AdminClientDetailPage";
import AdminIssueDetailPage from "./pages/admin/AdminIssueDetailPage";
import BookingChangeOptionsPage from "./pages/BookingChangeOptionsPage";
import AdminResourceDetailPage from "./pages/admin/AdminResourceDetailPage";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage";
import PaymentStubPage from "./pages/PaymentStubPage";


function App() {
  return (
    <AuthProvider>
      <Router>
        <NavBar />
        <Routes>
          {/* Гость + все */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Клиентские маршруты: бронирование */}
          <Route
            path="/bookings/workspace"
            element={
              <ProtectedRoute>
                <WorkspaceBookingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings/workspace/:resourceId"
            element={
              <ProtectedRoute>
                <WorkspaceBookingDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings/equipment"
            element={
              <ProtectedRoute>
                <EquipmentBookingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings/equipment/:resourceId"
            element={
              <ProtectedRoute>
                <WorkspaceBookingDetailPage bookingType="equipment" />
              </ProtectedRoute>
            }
          />


          <Route
            path="/my-bookings/:bookingId"
            element={
              <ProtectedRoute>
                <BookingDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
              path="/my-bookings/:bookingId/issue"
              element={
                <ProtectedRoute>
                  <CreateIssuePage />
                </ProtectedRoute>
              }
            />

          <Route
            path="/bookings/:bookingId/extend"
            element={<ProtectedRoute><ExtendBookingPage /></ProtectedRoute>}
          />


          <Route
            path="/my-bookings/:bookingId/change"
            element={
              <ProtectedRoute>
                <BookingChangeOptionsPage />
              </ProtectedRoute>
            }
          />

          <Route
          path="/payment/booking/:bookingId"
          element={<PaymentStubPage />}
        />




          {/* Профиль и разделы профиля */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/bookings"
            element={
              <ProtectedRoute>
                <MyBookingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />

          {/* Админские маршруты — только для isAdmin */}
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminAnalyticsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <AdminRoute>
                <AdminBookingsPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/bookings/:bookingId"
            element={<AdminRoute><AdminBookingDetailPage /></AdminRoute>}
          />

          <Route
            path="/admin/issues"
            element={
              <AdminRoute>
                <AdminIssuesPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/issues/:issueId"
            element={
              <AdminRoute>
                <AdminIssueDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/resources"
            element={
              <AdminRoute>
                <AdminResourcesPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/resources/:resourceId"
            element={
              <AdminRoute>
                <AdminResourceDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/create-booking"
            element={
              <AdminRoute>
                <AdminCreateBookingPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/clients"
            element={
              <AdminRoute>
                <AdminClientsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/clients/:userId"
            element={
              <AdminRoute>
                <AdminClientDetailPage />
              </AdminRoute>
            }
          />

          {/* Всё остальное → домой */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
