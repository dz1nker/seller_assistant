# REST API

Публичный путь через Next.js: `/api`. Внутри NestJS этот префикс убирается. Все изменяющие запросы требуют `Origin`, точно совпадающий с `WEB_ORIGIN`, и JSON для непустых тел. Коды и пароли Telegram вводятся только в форме подключения приложения.

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

## ИИ

Все endpoints требуют действующую сессию и ограничены Workspace из неё.

| Метод | Путь NestJS | Доступ / результат |
|---|---|---|
| GET | /ai/setup | Настройки провайдера: provider, configured, model, endpoint, proxyConfigured, revision; без ключей и URL прокси |
| POST | /ai/test | OWNER/ADMIN, пустой JSON; служебный Structured Outputs запрос без переписки; до 3 проверок/минуту на Workspace |
| GET | /ai/conversations/:id/access | allowed, reason, безопасные метаданные разрешения и провайдера; без доказательств/содержимого |
| POST | /ai/conversations/:id/authorization | OWNER/ADMIN, проверенный TELEGRAM + CLIENT; регистрирует разрешение, не запускает ИИ |
| DELETE | /ai/conversations/:id/authorization | OWNER/ADMIN; отзывает разрешение, удаляет результаты, сохраняет CRM-сообщения |
| POST | /ai/analyze, /ai/suggest | `{conversationId,length?:normal|shorter|longer}`; разрешённый CLIENT-контекст; три варианта, usage и версия |
| GET | /ai/conversations/:id | Разрешённые анализы; stale определяется по текущей версии контекста |
| POST | /ai/suggestions/:id/feedback | `{feedback:APPLIED|REJECTED}`; права и свежесть рекомендации проверяются повторно |

Разрешение содержит `sourcePolicyReference` (10–1000), `sourcePolicyVersion` (3–200), `rightsBasis` (DOCUMENTED_CONSENT / CONTRACTUAL_RIGHTS / OTHER_DOCUMENTED_RIGHTS), `rightsReference` (10–1000), `reviewNotes` (30–2000), `expiresAt` (ISO дата в будущем, до года), явные `policyReviewed=true`, `rightsVerified=true`, `providerRevision` из `/ai/setup`. Неизвестные поля, включая Workspace/actor/универсальный bypass, отвергаются. Ссылки и обоснования сохраняются для аудита и не входят в контекст LLM. Достоверность документов и допустимость обработки проверяет администратор; форма не создаёт права, если политика источника запрещает обработку.

Разрешение привязано к endpoint/модели, текущей роли проверившего и конкретному диалогу. Отзыв, истечение, изменение получателя/модели, исключение CLIENT блокируют новые запросы и применение рекомендаций. Если разрешение отозвано во время обработки, ответ не сохраняется. Уже переданный внешний запрос отозвать этим действием нельзя. Исходящие сообщения по-прежнему создаются только отдельным ручным действием пользователя.

Остальные MVP endpoints реализованы в контроллерах CRM/Channels. События Socket.IO содержат ID, в том числе `ai.analysis_ready` и `ai.authorization_changed`; клиент перечитывает данные через авторизованный HTTP API.
