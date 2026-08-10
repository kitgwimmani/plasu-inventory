import React from "react";
import { Dropdown, Badge, Button } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import useNotifications from "../hooks/useNotifications";

const ICONS = {
  requisition_submitted: "bi-file-earmark-plus",
  requisition_approved: "bi-check-circle",
  requisition_rejected: "bi-x-circle",
  signoff_needed: "bi-pen",
  ready_to_issue: "bi-box-seam",
  requisition_issued: "bi-truck",
  low_stock: "bi-exclamation-triangle",
  item_created: "bi-plus-square",
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const { notifications, unread, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  const handleClick = (n) => {
    if (!n.is_read) markRead(n.id);
    if (n.entity_type === "REQUISITION" && n.entity_id) {
      navigate(`/requisitions/${n.entity_id}`);
    } else if (n.entity_type === "ITEM" && n.entity_id) {
      navigate(`/inventory`);
    }
  };

  return (
    <Dropdown align="end" autoClose="outside">
      <Dropdown.Toggle as="a" className="nav-link bell-toggle" role="button" style={{ cursor: "pointer" }}>
        <i className="bi bi-bell-fill" />
        {unread > 0 && (
          <Badge pill bg="danger" className="bell-badge">
            {unread > 99 ? "99+" : unread}
          </Badge>
        )}
      </Dropdown.Toggle>
      <Dropdown.Menu className="notification-menu">
        <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
          <strong className="small">Notifications</strong>
          {unread > 0 && (
            <Button variant="link" size="sm" className="p-0 text-decoration-none" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="notification-list">
          {notifications.length === 0 && (
            <div className="text-center text-muted small py-4">You're all caught up.</div>
          )}
          {notifications.map((n) => (
            <Dropdown.Item
              key={n.id}
              className={`notification-item ${n.is_read ? "" : "unread"}`}
              onClick={() => handleClick(n)}
            >
              <div className="d-flex gap-2">
                <i className={`bi ${ICONS[n.type] || "bi-info-circle"} notification-icon`} />
                <div className="flex-grow-1">
                  <div className="notification-title">{n.title}</div>
                  {n.message && <div className="notification-message">{n.message}</div>}
                  <div className="notification-time">{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && <span className="unread-dot" />}
              </div>
            </Dropdown.Item>
          ))}
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
