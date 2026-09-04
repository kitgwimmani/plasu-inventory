import React, { useState } from "react";
import { Card, Form, Button, Alert, Spinner } from "react-bootstrap";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = location.state?.from?.pathname || "/dashboard";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to log in. Please check your details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrapper">
      <Card className="login-card shadow-lg">
        <div className="login-header">
          <img src="/logo.png" alt="Plateau State University, Bokkos logo" />
          <h5 className="mb-0">Plateau State University, Bokkos</h5>
          <div className="small">Store Management Information System</div>
        </div>
        <Card.Body className="p-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                type="email"
                placeholder="you@plasu.edu.ng"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-4">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>
            <Button type="submit" className="btn-plasu w-100" disabled={busy}>
              {busy ? <Spinner size="sm" animation="border" /> : "Log In"}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}
