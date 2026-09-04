import React, { useState } from "react";
import { Navbar, Nav, Container, Dropdown, NavDropdown } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, hasRole, rolesLabel, CLEARANCE_ROLES } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import api from "../api/axios";

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [backingUp, setBackingUp] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = hasRole(user, "superadmin", "ictadmin");
  const canManageStore = hasRole(user, "head_of_store");
  const canSeeClearance = hasRole(user, "head_of_store", "superadmin", "ictadmin", ...CLEARANCE_ROLES);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await api.get("/backup", { responseType: "blob" });
      const disposition = res.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `plasu_smis_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Could not download database backup.");
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <Navbar expand="lg" className="plasu-navbar px-3" variant="dark">
      <Container fluid>
        <Navbar.Brand as={Link} to="/dashboard" className="d-flex align-items-center gap-2">
          <img src="/logo.png" alt="PLASU Bokkos logo" height="38" />
          <span className="plasu-brand-title">
            PLASU SMIS
            <small>Store Management Information System</small>
          </span>
        </Navbar.Brand>
        <div className="d-flex align-items-center order-lg-3 gap-1">
          <NotificationBell />
          <Dropdown align="end">
            <Dropdown.Toggle as="a" className="nav-link" role="button" style={{ cursor: "pointer" }}>
              <i className="bi bi-person-circle me-1" />
              {user.name} <span className="text-warning">({rolesLabel(user)})</span>
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item as={Link} to="/change-password">
                <i className="bi bi-key me-2" />Change Password
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={handleLogout}>
                <i className="bi bi-box-arrow-right me-2" />Log Out
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
        <Navbar.Toggle aria-controls="main-navbar" className="order-lg-2" />
        <Navbar.Collapse id="main-navbar" className="order-lg-1">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/dashboard"><i className="bi bi-speedometer2 me-1" />Dashboard</Nav.Link>
            <Nav.Link as={Link} to="/inventory"><i className="bi bi-box-seam me-1" />Inventory</Nav.Link>
            <Nav.Link as={Link} to="/requisitions"><i className="bi bi-file-earmark-text me-1" />Requisitions</Nav.Link>
            {canSeeClearance && (
              <Nav.Link as={Link} to="/clearance"><i className="bi bi-clipboard-check me-1" />Clearance</Nav.Link>
            )}
            <Nav.Link as={Link} to="/reports"><i className="bi bi-printer me-1" />Reports</Nav.Link>
            {!isAdmin && canManageStore && (
              <Nav.Link as={Link} to="/categories"><i className="bi bi-tags me-1" />Categories</Nav.Link>
            )}
            {isAdmin && (
              <NavDropdown title={<><i className="bi bi-gear me-1" />Admin</>} id="admin-nav-dropdown">
                <NavDropdown.Item as={Link} to="/users"><i className="bi bi-people me-2" />Users</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/departments"><i className="bi bi-diagram-3 me-2" />Departments</NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/categories"><i className="bi bi-tags me-2" />Item Categories</NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item as={Link} to="/audit"><i className="bi bi-clock-history me-2" />Audit Log</NavDropdown.Item>
                <NavDropdown.Item onClick={handleBackup} disabled={backingUp}>
                  <i className="bi bi-cloud-download me-2" />{backingUp ? "Backing up…" : "Backup Database"}
                </NavDropdown.Item>
              </NavDropdown>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
