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
  inventoryadmin: "Inventory Admin",
  technical_expert: "Technical Expert",
  audit_officer: "Audit Officer",
  asset_officer: "Asset / Insurance Officer",
};

export const SIGNOFF_PARTY_ROLES = ["technical_expert", "audit_officer", "asset_officer"];
