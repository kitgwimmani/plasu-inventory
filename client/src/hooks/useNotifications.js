import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";

// Polls the bell notification feed. Cheap client-side polling is more than
// enough for a store-management system's traffic level, and avoids the
// complexity of websockets for something that just needs a badge count.
export default function useNotifications(pollMs = 20000) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(() => {
    api
      .get("/notifications")
      .then((res) => {
        setNotifications(res.data.notifications);
        setUnread(res.data.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, pollMs);
    return () => clearInterval(timerRef.current);
  }, [load, pollMs]);

  const markRead = useCallback(
    async (id) => {
      await api.put(`/notifications/${id}/read`);
      load();
    },
    [load]
  );

  const markAllRead = useCallback(async () => {
    await api.put("/notifications/read-all");
    load();
  }, [load]);

  return { notifications, unread, reload: load, markRead, markAllRead };
}
