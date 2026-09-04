import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("plasu_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("plasu_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem("plasu_user", JSON.stringify(res.data.user));
      })
      .catch(() => {
        localStorage.removeItem("plasu_token");
        localStorage.removeItem("plasu_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("plasu_token", res.data.token);
    localStorage.setItem("plasu_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("plasu_token");
    localStorage.removeItem("plasu_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export const ROLE_LABELS = {
  superadmin: "Super Admin",
  ictadmin: "ICT Admin",
  hod: "Head of Department",
  head_of_store: "Head of Store",
  issuance_officer: "Issuance Officer",
  technical_expert: "Technical Expert",
  audit_officer: "Audit Officer",
  asset_officer: "Asset / Insurance Officer",
};

// The three stock-receipt clearance signatories.
export const CLEARANCE_ROLES = ["technical_expert", "audit_officer", "asset_officer"];
// The two requisition clearance signatories, in signing order.
export const SIGNOFF_ROLES = ["head_of_store", "issuance_officer"];

// Does the user hold ANY of the given roles? Falls back to the legacy single
// `role` field for a user object that predates multi-role.
export function hasRole(user, ...roles) {
  if (!user) return false;
  const set = user.roles && user.roles.length ? user.roles : user.role ? [user.role] : [];
  return roles.some((r) => set.includes(r));
}

// Roles that can see every requisition / department's data (vs. only their own).
export const FULL_ACCESS_ROLES = ["superadmin", "ictadmin", "head_of_store", "issuance_officer"];

export function rolesLabel(user) {
  const set = user?.roles && user.roles.length ? user.roles : user?.role ? [user.role] : [];
  return set.map((r) => ROLE_LABELS[r] || r).join(", ");
}
