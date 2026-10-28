"use client";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentUser } from "@sales/shared";
import { api, ApiError } from "../lib/api";
export function Realtime() {
  const client = useQueryClient();
  useEffect(() => {
    const socket = io({
      path: "/api/socket.io",
      withCredentials: true,
      transports: ["polling", "websocket"],
    });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const groups: Record<string, string[]> = {
      "conversation.updated": [
        "conversations",
        "contacts",
        "messages",
        "analysis",
        "deals",
        "analytics",
      ],
      "message.created": ["messages", "conversations", "analysis"],
      "message.updated": ["messages", "conversations", "analysis"],
      "message.send_status_changed": [
        "messages",
        "conversations",
        "analysis",
        "analytics",
      ],
      "deal.updated": [
        "deals",
        "pipelines",
        "conversations",
        "analytics",
        "analysis",
      ],
      "task.created": ["tasks", "notifications", "analytics"],
      "ai.analysis_ready": ["analysis", "analytics"],
      "connection.status_changed": ["connections"],
      "notification.created": ["notifications"],
      "business.updated": ["business", "products", "analysis"],
    };
    const pending = new Set<string>();
    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    for (const [kind, keys] of Object.entries(groups))
      socket.on(kind, () => {
        for (const key of keys) pending.add(key);
        if (!invalidateTimer)
          invalidateTimer = setTimeout(() => {
            for (const key of pending)
              void client.invalidateQueries({ queryKey: [key] });
            pending.clear();
            invalidateTimer = undefined;
          }, 150);
      });
    const reconnect = () => {
      if (timer) clearTimeout(timer);
      if (stopped) return;
      timer = setTimeout(() => {
        void api<CurrentUser>("/auth/me")
          .then((user) => {
            if (stopped) return;
            client.setQueryData(["user"], user);
            socket.connect();
          })
          .catch((error) => {
            if (stopped) return;
            if (error instanceof ApiError && error.status === 401)
              void client.invalidateQueries({ queryKey: ["user"] });
            else reconnect();
          });
      }, 3000);
    };
    socket.on("connect", () => {
      if (timer) clearTimeout(timer);
      for (const key of new Set(Object.values(groups).flat()))
        void client.invalidateQueries({ queryKey: [key] });
    });
    socket.on("connect_error", reconnect);
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") reconnect();
    });
    return () => {
      stopped = true;
      if (invalidateTimer) clearTimeout(invalidateTimer);
      if (timer) clearTimeout(timer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [client]);
  return null;
}
