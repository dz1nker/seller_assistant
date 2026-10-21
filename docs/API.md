# Foundation REST API

Публичный путь через Next.js: `/api`. Внутри NestJS этот префикс убирается. Все изменяющие запросы требуют `Origin`, точно совпадающий с `WEB_ORIGIN`, и JSON для непустых тел. Не отправляйте коды Telegram: соответствующих endpoints ещё нет.

| Метод | Путь NestJS | Доступ | Результат |
|---|---|---|---|
| POST | /auth/register | Public + Origin + limits | 201, CurrentUser, cookies |
| POST | /auth/login | Public + Origin + limits | 200, CurrentUser, cookies |
| POST | /auth/refresh | Refresh cookie + Origin | 204, rotated cookies |
| POST | /auth/logout | Cookies + Origin | 204, session revoked, cookies cleared |
| GET | /auth/me | Access cookie | CurrentUser |
| GET | /workspaces/current | Live workspace membership | WorkspaceView |
| PATCH | /workspaces/current | OWNER/ADMIN + Origin | Updated WorkspaceView |
| GET | /health/live | Public | `{status:"ok"}` |
| GET | /health/ready | Public | 200 if PostgreSQL + Redis respond, else 503 |

Регистрация: `{email, password, name, workspaceName}`. Вход: `{email, password}`. Пароль от 12 символов и не более 72 UTF-8 байт. Email нормализуется в lowercase. Дополнительные поля отклоняются.

Обновление бизнеса: `{name, description, timezone}` — все три поля обязательны; ограничения 2–120 символов для имени, до 4000 для описания, валидный IANA timezone. `id`, `workspaceId`, `role` не принимаются. Tenant выбирается из сессии, не из URL, query или заголовков.

CurrentUser: `{id, email, name, workspaceId, role}`. WorkspaceView: `{id, name, description, timezone, createdAt, members, pipelines}`; members содержат только userId/name/role, pipelines — id/name/stages. Password hashes, token digests и значения секретов не возвращаются.

Cookies: `sc_access` (15 минут), `sc_refresh` (до абсолютных 7 дней), HttpOnly, SameSite=Strict, Path=/api; Secure в production. Browser `credentials: same-origin`; не сохраняйте токены в localStorage. При 401 клиент делает один refresh, затем повторяет исходный запрос; refresh errors обрабатываются отдельно от отсутствия сессии. Несколько refresh в одной вкладке объединяются. Старые refresh/access токены после ротации недействительны.

Ошибки: `{statusCode, message, requestId, fields?}`. `fields` содержит только имена и сообщения валидации, не переданные значения. Основные статусы: 400 validation/JSON, 401 session/login, 403 Origin/role, 409 duplicate signup, 413 body limit, 429 rate limit, 503 dependency unavailable. Размер тела — 32 KiB. Сохранённый Workspace изменяется вместе с записью audit в транзакции.

Endpoints контактов, сообщений, сделок, задач, аналитики, Telegram и AI из ТЗ ещё не реализованы; запросы к ним не считаются успешными операциями. Событий WebSocket пока нет.
