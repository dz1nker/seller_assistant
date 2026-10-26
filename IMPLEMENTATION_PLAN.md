# План реализации

Основание: [исходное ТЗ](docs/SPEC.md). Работать последовательно; завершать этап кодом, типами, сборкой, необходимыми тестами и явным списком ограничений. Не заменять интеграции статическими экранами. Отмечены только реально реализованные возможности.

## 1. Foundation

- [x] npm monorepo, Node.js/TypeScript, lockfile.
- [x] Next.js App Router, React, Tailwind, базовый UI kit по паттернам shadcn/Radix.
- [x] NestJS с разделением инфраструктуры, auth, workspaces, health.
- [x] Настоящие PostgreSQL, Prisma 7 + pg adapter, Redis.
- [x] Версионированная SQL-миграция, транзакции, advisory lock, checksum ledger.
- [x] Регистрация владельца и Workspace, вход/выход, HttpOnly access/refresh cookies, ротация.
- [x] Модель нескольких членств и ролей OWNER/ADMIN/MEMBER; проверка ролей и tenant scope.
- [x] Начальная воронка с 7 стадиями и необязательный идемпотентный seed без общего пароля.
- [x] Русская навигация: Сегодня, Диалоги, Воронка, Аналитика, Мой бизнес, Настройки.
- [x] Настройки бизнеса сохраняются через API в PostgreSQL.
- [x] Светлая/тёмная темы, мобильное меню, keyboard controls, loading/error/empty states.
- [x] Rate limits на Redis, CSRF Origin check, DTO validation, безопасные ошибки/аудит.
- [x] Docker Compose, Dockerfile, `.env.example`, health endpoints.
- [x] CI workflow: typecheck, unit/integration, build, browser e2e.
- [x] Typecheck всего кода/тестов, сборка API/web, 9 unit + 18 integration + 5 browser тестов.
- [x] Полный Compose запущен; регистрация/запись в браузере, сохранение сессии после restart и восстановление после Redis outage проверены.
- [x] Повторная установка из lockfile выполнена через scripts/cloud-install.sh.
- [x] Seed выполнен дважды; проверено отсутствие дублей и сохранение существующей идентичности.

**Результат:** рабочий локальный фундамент приложения с реальным хранением данных и авторизацией. Интерфейс отражает текущую реализацию: нет фиктивных сделок, переписок, подключений или показателей.

**Ограничения:** пока нет CRUD клиентов/сделок/продуктов, drag-and-drop, Privacy Engine, TDLib, AI, задач, аналитики, WebSocket/BullMQ. Приглашения и переключение Workspace ещё отсутствуют; логин выбирает первое членство. Нет password reset/email verification/account deletion UI. Срок сессий проверяется, но автоматическая уборка ещё не реализована. Подробности — SECURITY.md. Для генерации клиента используется закреплённый внутренний API Prisma; миграции ведёт SQL-runner, не Prisma Migrate.

## 2. CRM — следующий этап

- [ ] Раздельные модели Contact, ContactIdentity, Conversation, ConversationPolicy, Message, Product, Deal, DealConversation.
- [ ] Workspace constraints, индексы источников, пагинация и audit; миграция без потери Foundation-данных.
- [ ] Privacy Engine: EXCLUDED/CANDIDATE/CLIENT; очистка содержимого и производных данных при исключении.
- [ ] CRUD контактов и продуктов, настройки бизнеса/стиля, несколько воронок.
- [ ] Синтетические диалоги с явным source=DEMO, без имитации Telegram.
- [ ] Сделки, nullable amount, история стадий, причины проигрыша.
- [ ] dnd-kit канбан, транзакционное перемещение, rollback при API error.
- [ ] Карточка сделки, ручное подтверждение успеха, безопасная миграция стадий при удалении.
- [ ] Tenant/privacy integration tests, UI CRUD/kanban e2e, типы и сборка.

**Критерий:** работающая CRM на разрешённых синтетических данных без внешних интеграций.

## 3. Telegram Gateway

- [ ] `packages/channel-contracts`, capability-based MessagingChannelAdapter, отдельный TDLib gateway.
- [ ] Серверные API credentials, авторизация phone/code/email/2FA/device states без хранения одноразовых кодов.
- [ ] Изолированные зашифрованные TDLib sessions, ключи отдельно, отключение/очистка.
- [ ] Список чатов только с разрешёнными метаданными, ручной выбор CLIENT.
- [ ] История разрешённых сообщений с пагинацией, replies, attachments policy и корректными заглушками типов.
- [ ] Ручная отправка, command idempotency, reconciliation, pending/sending/sent/failed и подтверждения TDLib.
- [ ] Incoming/outgoing/edit/delete/status events, включая официальный клиент; дедупликация.
- [ ] WebSocket с tenant authentication, reconnect/recovery, BullMQ там, где нужны фоновые команды.
- [ ] Матрица тестов авторизации/ошибок/дублей/разрывов/рестартов и реальная проверка с предоставленным аккаунтом.

**Критерий:** реальная переписка из приложения; отсутствие credentials явно ограничивает только живую проверку, а не подменяется mock-подключением.

## 4. AI Engine

- [ ] `packages/ai-contracts`, сменяемый LLM adapter, Structured Outputs/Zod.
- [ ] Версии промптов, usage/cost, история, feedback, фактическое применение и отправка как разные события.
- [ ] AIPolicyGuard: Telegram запрещён по умолчанию; проверяемое основание источника/согласий, без универсального bypass.
- [ ] KnowledgeRetriever, база знаний, AIContextBuilder и ограниченный релевантный контекст.
- [ ] ConversationAnalyzer, DealIntelligence, SalesStrategist, ResponseGenerator.
- [ ] Facts CONFIRMED/INFERRED/UNKNOWN + provenance, версия deal memory, stale suggestions.
- [ ] Три тона, редактирование в composer, ручная отправка без доступа AI к sendMessage.
- [ ] Prompt injection/invalid JSON/provider failure/stale/privacy tests; реальный LLM только при допустимых данных и ключе.

## 5. Задачи и аналитика

- [ ] Tasks, reminders, priorities, notifications, retention-aware BullMQ jobs.
- [ ] «Сегодня» с реальными задачами и просрочками.
- [ ] Воронки, потери, рекомендации, использование/подтверждённая отправка; без автоматической AI attribution.
- [ ] Интеграционные/e2e-тесты напоминаний и отчётов, типы/сборка.

## 6. Production Readiness

- [ ] Полный security review и устранение ограничений SECURITY.md.
- [ ] Email verification/reset, управление сессиями, account/data deletion, retention jobs.
- [ ] Observability, отказоустойчивость, backup/restore drills, runbooks.
- [ ] Миграционный release job, least-privilege runtime DB role, verified TLS, secrets rotation.
- [ ] Нагрузочные и recovery tests, rate limiting за доверенным ingress, CSP.
- [ ] Администрирование, тарифы/лимиты, документация выпуска.
- [ ] Повторная проверка всех критериев MVP из ТЗ.

## Подтверждения текущего прохода

Проверено 21 октября 2026: проверка типов, сборка API/web, 9 unit, 18 integration, 5 Chromium e2e, повторный seed, повторное применение миграций, `npm audit` без найденных уязвимостей. Логи успешных команд относятся к текущей среде. Результаты Docker smoke/restart и ограничения облачного восстановления описаны в ENVIRONMENT.md. Выполнение GitHub Actions и восстановление в новой облачной задаче отдельно не утверждаются.

26 октября 2026 проверена облегчённая Docker-упаковка: оба runtime-образа собраны и запущены, общий несжатый размер уменьшен примерно на 79%, frontend проходит typecheck. Container smoke в Chromium подтвердил регистрацию, сохранение бизнес-настроек, сохранение сессии после restart и восстановление после Redis outage. Код бизнес-функций и схема БД не менялись. Подробности измерений и границы проверки — ENVIRONMENT.md.
