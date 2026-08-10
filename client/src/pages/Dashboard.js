import React from "react";
import { useAuth, SIGNOFF_PARTY_ROLES } from "../context/AuthContext";
import AdminDashboard from "./dashboards/AdminDashboard";
import HodDashboard from "./dashboards/HodDashboard";
import InventoryAdminDashboard from "./dashboards/InventoryAdminDashboard";
import SignoffDashboard from "./dashboards/SignoffDashboard";

export default function Dashboard() {
  const { user } = useAuth();

  if (user.role === "superadmin" || user.role === "ictadmin") return <AdminDashboard />;
  if (user.role === "hod") return <HodDashboard />;
  if (user.role === "inventoryadmin") return <InventoryAdminDashboard />;
  if (SIGNOFF_PARTY_ROLES.includes(user.role)) return <SignoffDashboard />;
  return null;
}
