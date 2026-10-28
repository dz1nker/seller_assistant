"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
export function useData<T>(key: string, path: string, enabled = true) {
  return useQuery({
    queryKey: [key, path],
    queryFn: () => api<T>(path),
    enabled,
  });
}
export function useAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) =>
      api<unknown>(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    onSuccess: () => {
      for (const key of [
        "contacts",
        "products",
        "pipelines",
        "deals",
        "conversations",
        "tasks",
        "notifications",
        "analytics",
        "business",
      ])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
}
export function useDebounced(value: string) {
  const [v, set] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => set(value), 250);
    return () => clearTimeout(id);
  }, [value]);
  return v;
}
export function localDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ru", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "Не назначено";
}
export function amount(value: string | null, currency: string) {
  if (value === null) return "Сумма не указана";
  try {
    return new Intl.NumberFormat("ru", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
}
