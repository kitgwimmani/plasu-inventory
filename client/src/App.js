import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Inventory from "./pages/Inventory";
import Departments from "./pages/Departments";
import Categories from "./pages/Categories";
import Reports from "./pages/Reports";
import Requisitions from "./pages/Requisitions";
import CreateRequisition from "./pages/CreateRequisition";
import RequisitionDetail from "./pages/RequisitionDetail";
import Clearance from "./pages/Clearance";
import ClearanceDetail from "./pages/ClearanceDetail";
import ChangePassword from "./pages/ChangePassword";
import AuditLog from "./pages/AuditLog";
import NotFound from "./pages/NotFound";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

const CLEARANCE_ACCESS = [
  "head_of_store",
  "superadmin",
  "ictadmin",
  "technical_expert",
  "audit_officer",
  "asset_officer",
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/requisitions" element={<Requisitions />} />
        <Route
          path="/requisitions/new"
          element={
            <ProtectedRoute roles={["hod"]}>
              <CreateRequisition />
            </ProtectedRoute>
          }
        />
        <Route path="/requisitions/:id" element={<RequisitionDetail />} />
        <Route
          path="/clearance"
          element={
            <ProtectedRoute roles={CLEARANCE_ACCESS}>
              <Clearance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clearance/:id"
          element={
            <ProtectedRoute roles={CLEARANCE_ACCESS}>
              <ClearanceDetail />
            </ProtectedRoute>
          }
        />
        <Route path="/reports" element={<Reports />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={["superadmin", "ictadmin"]}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/departments"
          element={
            <ProtectedRoute roles={["superadmin", "ictadmin"]}>
              <Departments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute roles={["superadmin", "ictadmin", "head_of_store"]}>
              <Categories />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute roles={["superadmin", "ictadmin"]}>
              <AuditLog />
            </ProtectedRoute>
          }
        />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
