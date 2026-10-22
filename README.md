# Sales Copilot

Рабочее пространство для специалистов, которые продают через личные сообщения. Принцип продукта: **ИИ предлагает — пользователь решает и отправляет**.

Реализован этап 1 — Foundation: настоящие PostgreSQL/Redis, backend NestJS, регистрация и вход, серверные сессии, Workspace, роли, начальная воронка и интерфейс Next.js. Это основа приложения, **не готовый MVP**. CRM со сделками, Telegram и ИИ пока не реализованы. Неисполненные функции обозначены в интерфейсе; чужие или демонстрационные переписки не выдаются за реальные.

## Стек и структура

Node.js 24 (также поддерживается 22.12+), npm workspaces, TypeScript strict, Next.js 16/App Router, React 19, Tailwind 4, компоненты по паттернам shadcn/ui + Radix, TanStack Query, React Hook Form/Zod, NestJS 11, Prisma 7 с PostgreSQL JS-драйвером, PostgreSQL 17, Redis 7. Версии разрешены в `package-lock.json`.

```text
apps/web/                 Next.js и русскоязычный интерфейс
apps/api/                 NestJS: auth, workspaces, health, infrastructure
packages/database/        Prisma schema, SQL-миграции, создание владельца, seed
packages/shared/          Контракты API и Zod-схемы
packages/ui/              Базовые компоненты интерфейса
scripts/                  Конфигурация, генерация клиента и SQL-миграции
tests/                    Unit, интеграционные и браузерные тесты
docs/                     Исходное ТЗ и описание API
```

## Локальный запуск

Для Windows 10/11 есть `START_WINDOWS.cmd`: распакуйте ZIP и запустите этот файл двойным щелчком. Он проверит/установит Docker Desktop через WinGet, подготовит конфигурацию внутри Docker и откроет приложение. Node.js на хосте для этого способа не требуется. Системные подтверждения, возможная перезагрузка и настройка Docker/WSL выполняются пользователем. Подробности и границы проверки — [START_HERE_RU.md](START_HERE_RU.md). Остановка с сохранением данных — `STOP_WINDOWS.cmd`.

Нужны Node.js 24, npm и Docker с Compose v2. Команды выполняются из корня репозитория.

```bash
npm ci
npm run env:init
npm run infra:up
npm run db:generate
npm run build:packages
npm run db:migrate
npm run dev
```

Web слушает порт 3000, API — 4000. Откройте `/register` на локальном web-сервере и создайте владельца: Workspace и семь стадий создаются транзакционно. Общего пароля и автоматически созданного аккаунта нет.

`env:init` создаёт игнорируемый `.env` с правами 0600 и случайными локальными паролями PostgreSQL/Redis. Уже существующий файл сохраняется. Не удаляйте `.env` при сохранённых томах: новые пароли не обновят автоматически пароль в уже инициализированной БД.

Используйте одно и то же имя хоста в браузере и `WEB_ORIGIN`: по умолчанию `http://localhost:3000`. API требует этот Origin у всех изменяющих запросов. Next.js проксирует `/api/*` на NestJS, cookies доступны только на `/api`.

## PostgreSQL, Redis и миграции

Compose создаёт отдельные постоянные тома `pgdata` и `redisdata`; порты БД/Redis открыты только на loopback. `npm run infra:down` останавливает сервисы и сохраняет тома. `docker compose down -v` уничтожает данные — не используйте его как обычную остановку.

```bash
npm run db:generate
npm run db:migrate
```

Генератор использует официальные, согласованно закреплённые npm-пакеты Prisma и WASM. Он не требует скачивания отдельного нативного schema engine. Программный API генератора внутренний: обновляйте `prisma`, `@prisma/client`, `@prisma/internals` и `@prisma/client-generator-js` совместно, затем выполняйте полный набор проверок.

Миграции — версионированные SQL-файлы в `packages/database/prisma/migrations`. `scripts/migrate.mjs` применяет их по порядку, по одной транзакции, под advisory lock; SHA-256 и факт применения сохраняются в `_sales_migrations`. Изменение применённого SQL вызывает ошибку. **Не смешивайте этот журнал с Prisma Migrate.** Для новой схемы измените Prisma schema, добавьте новую SQL-миграцию, регенерируйте клиент и проверьте чистую и существующую БД. Блокируемый CDN Prisma не обходится, TLS/контрольные суммы не отключены.

При внешних PostgreSQL/Redis задайте `DATABASE_URL` и `REDIS_URL`. Для удалённой БД настройте проверяемый TLS через параметры PostgreSQL; не используйте `rejectUnauthorized: false`.

## Seed

Seed необязателен; данные клиентов не выдумываются. Введите `SEED_EMAIL` и уникальный `SEED_PASSWORD` (12–72 байта) в локальном `.env` или менеджере секретов, затем:

```bash
npm run db:seed
```

Создаются владелец, Workspace «Мой бизнес» и стандартная воронка. Повторный запуск не меняет существующего пользователя, пароль и данные. Не передавайте пароль аргументом команды и не коммитьте `.env`. После применения seed удалите его пароль из конфигурации, если повторная инициализация не нужна.

## Проверки

```bash
npm run typecheck
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Интеграционные тесты используют отдельную БД `sales_copilot_test`, e2e — `sales_copilot_e2e_test`; при необходимости задайте `TEST_DATABASE_URL`/`E2E_DATABASE_URL`. Имя обязано заканчиваться на `_test`. Для автоматического создания БД локальному пользователю нужен `CREATEDB`; иначе создайте тестовые БД заранее. Интеграционные тесты очищают только созданные ими аккаунты; браузерные тестовые аккаунты остаются в отдельной e2e-БД.

E2E автоматически поднимают API на 4100 и Next dev на 3100, затем останавливают эти процессы. Не запускайте параллельно несколько e2e-наборов на этих портах. В облачной среде обнаруживается системный `/usr/bin/chromium`; можно явно задать `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Запуск Chromium без sandbox разрешается только через явный `PLAYWRIGHT_NO_SANDBOX=true` для изолированной среды.

GitHub Actions выполняет проверку типов, unit/integration, сборку и Chromium e2e. Сам workflow создан; факт его выполнения на GitHub отдельно не подтверждён.

## Полностью в Docker

```bash
npm run env:init
docker compose --profile app up -d --build --wait
```

Сервис API сам применяет миграции перед запуском. Только web публикует порт приложения; запросы к API идут по внутренней сети. Это локальная конфигурация: API работает с `API_NODE_ENV=development`, `COOKIE_SECURE=false`. Инструкции для прокси в облачной сборке: [ENVIRONMENT.md](ENVIRONMENT.md).

## Telegram / TDLib

Gateway ещё не реализован; сейчас приложение не подключается к Telegram, не хранит сессии и не отправляет сообщения. Запланирован отдельный `apps/telegram-gateway`, официальный TDLib/MTProto, без замены Bot API. Для этапа 3 потребуются:

1. Приложение и `api_id`/`api_hash`, полученные через официальный раздел API development tools на `my.telegram.org`.
2. Серверные `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` из защищённых настроек; эти значения никогда не публикуются в Next.js и не имеют префикса `NEXT_PUBLIC_`.
3. Закреплённая сборка TDLib, изолированные зашифрованные каталоги сессий и ключи шифрования вне репозитория.
4. Реализация состояний авторизации, privacy engine, событий синхронизации и идемпотентной ручной отправки с подтверждениями TDLib.

Простое заполнение переменных в текущей версии ничего не подключает. Реальная проверка Telegram потребует аккаунта, кода/2FA в защищённом UI и необходимых разрешений. Их нельзя запрашивать в логах или чатах разработки. Секретные и самоуничтожающиеся чаты исключаются из MVP.

## AI-провайдер

AI Service ещё не реализован; `AI_PROVIDER`/`AI_API_KEY` зарезервированы и не читаются текущим backend. На этапе 4 будут реализованы сменяемые адаптеры, Zod Structured Outputs, версии контекста/промптов, история и учёт токенов. Начальные данные — синтетические и явно помеченные. Реальные Telegram-диалоги по умолчанию запрещены для LLM; отметка CLIENT не считается согласием на такую обработку. Универсального переключателя для обхода политики не будет.

## Production-развёртывание

Foundation пока не предназначен для публичной SaaS-эксплуатации. До релиза выполните [SECURITY.md](SECURITY.md) и этап 6 в [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Минимальная конфигурация будущего развёртывания: HTTPS reverse proxy, `WEB_ORIGIN` с точным HTTPS origin, `API_NODE_ENV=production`, `COOKIE_SECURE=true`, закрытые API/БД/Redis, доверенный TLS, управляемые секреты и внешние резервные копии. Backend отказывается запускаться в production с небезопасными cookies или HTTP origin. `INTERNAL_API_URL` задаётся **при сборке** Next.js; пересобирайте web при смене адреса backend. В контейнере это `http://api:4000`.

Перед миграцией сделайте резервную копию, примените `npm run db:migrate` один раз отдельным release job, затем запустите API и web. Проверьте `/health/ready` и функциональный вход. Для запуска собранных приложений используются `npm run start -w @sales/api` и `npm run start -w @sales/web`.

Дальнейшие решения и ограничения: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [ENVIRONMENT.md](ENVIRONMENT.md), [docs/API.md](docs/API.md).
