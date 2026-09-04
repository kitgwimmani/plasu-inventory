import React from "react";
import { useAuth, CLEARANCE_ROLES } from "../context/AuthContext";
import AdminDashboard from "./dashboards/AdminDashboard";
import HodDashboard from "./dashboards/HodDashboard";
import HeadOfStoreDashboard from "./dashboards/HeadOfStoreDashboard";
import IssuanceOfficerDashboard from "./dashboards/IssuanceOfficerDashboard";
import ClearanceDashboard from "./dashboards/ClearanceDashboard";

// A user's PRIMARY role (users.role) decides which dashboard they see.
export default function Dashboard() {
  const { user } = useAuth();

  if (user.role === "superadmin" || user.role === "ictadmin") return <AdminDashboard />;
  if (user.role === "hod") return <HodDashboard />;
  if (user.role === "head_of_store") return <HeadOfStoreDashboard />;
  if (user.role === "issuance_officer") return <IssuanceOfficerDashboard />;
  if (CLEARANCE_ROLES.includes(user.role)) return <ClearanceDashboard />;
  return null;
}
