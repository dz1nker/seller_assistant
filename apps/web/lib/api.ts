export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
let refreshing: Promise<Response> | null = null;
async function refreshSession() {
  if (!refreshing) refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' }).finally(() => { refreshing = null; });
  return refreshing;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const request = () => fetch(`/api${path}`, {
    ...options, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  let response: Response;
  try {
    response = await request();
    if (response.status === 401 && !['/auth/login', '/auth/register', '/auth/logout'].includes(path)) {
      const refreshed = await refreshSession();
      response = refreshed.ok ? await request() : refreshed;
    }
  } catch { throw new ApiError(0, 'Нет связи с сервером. Проверьте подключение и повторите попытку.'); }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : 'Не удалось выполнить запрос';
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
