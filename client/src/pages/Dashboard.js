import React from "react";
import { Alert } from "react-bootstrap";
import { useAuth, hasRole, CLEARANCE_ROLES } from "../context/AuthContext";
import AdminDashboard from "./dashboards/AdminDashboard";
import HodDashboard from "./dashboards/HodDashboard";
import HeadOfStoreDashboard from "./dashboards/HeadOfStoreDashboard";
import IssuanceOfficerDashboard from "./dashboards/IssuanceOfficerDashboard";
import ClearanceDashboard from "./dashboards/ClearanceDashboard";

// A user's PRIMARY role (users.role) normally decides the dashboard; we fall
// back to their full role set so a stale/renamed primary role never leaves them
// on a blank page.
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  const role = user.role;
  if (role === "superadmin" || role === "ictadmin" || hasRole(user, "superadmin", "ictadmin"))
    return <AdminDashboard />;
  if (role === "head_of_store" || hasRole(user, "head_of_store")) return <HeadOfStoreDashboard />;
  if (role === "issuance_officer" || hasRole(user, "issuance_officer")) return <IssuanceOfficerDashboard />;
  if (role === "hod" || hasRole(user, "hod")) return <HodDashboard />;
  if (CLEARANCE_ROLES.includes(role) || hasRole(user, ...CLEARANCE_ROLES)) return <ClearanceDashboard />;

  return (
    <Alert variant="info">
      Your account has no dashboard configured. Use the menu above to reach Inventory, Requisitions
      and Reports.
    </Alert>
  );
}
