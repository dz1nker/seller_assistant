# Sales Copilot

Локальная CRM для продаж через личный Telegram: контакты, продукты, сделки, переписка, задачи и помощник для подготовки ответов. Интерфейс на русском, светлая и тёмная темы, мобильная навигация.

Реализованы CRUD контактов и продуктов, профиль бизнеса и текстовая база знаний, несколько воронок с редактируемыми этапами, канбан с историей и контролем одновременных изменений, задачи/напоминания и аналитика. Отдельный Gateway использует настоящую TDLib для авторизации обычного Telegram-аккаунта и ручной отправки сообщений. AI работает на допустимых синтетических диалогах через демонстрационный алгоритм или OpenAI-compatible API; Telegram-переписки внешнему AI не передаются.

Живой вход в Telegram и внешний LLM требуют ваших ключей и отдельной проверки с аккаунтом. Ключей в репозитории нет. Демопереписки явно отмечены и не выдают себя за Telegram; демосделки исключены из реальных продаж в аналитике. Эта версия предназначена для локального MVP; ограничения публичного SaaS описаны в [SECURITY.md](SECURITY.md).

## Быстрый запуск Windows

Скачайте [ZIP проекта](https://github.com/dz1nker/seller_assistant/archive/refs/heads/main.zip), распакуйте **все** файлы и запустите `START_WINDOWS.cmd`. Нужен Docker Desktop в режиме Linux containers. Node.js на компьютере отдельно не нужен. Launcher сохраняет существующие пароли `.env` и добавляет недостающие внутренние ключи. Подробная инструкция и обновление — [START_HERE_RU.md](START_HERE_RU.md).

Откройте http://localhost:3000/register и создайте свой аккаунт. Общего логина/пароля нет. В разделе «Диалоги» кнопка «Создать демо-данные» позволяет проверить CRM и помощника без внешних аккаунтов.

## Docker на Linux/macOS

Нужны Docker Compose v2 и Node.js 24 для генерации локальной конфигурации:

```bash
node scripts/init-env.mjs
docker compose --profile app up -d --build --wait
```

Без Node.js на хосте конфигурацию можно создать контейнером:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/project" -w /project node:24-bookworm-slim node scripts/init-env.mjs
```

Открывайте именно `localhost:3000`: он должен совпадать с `WEB_ORIGIN`. Compose запускает PostgreSQL 17, Redis 7, NestJS API, Next.js web и TDLib Gateway. Порты БД/Redis привязаны к loopback; API и Gateway доступны только во внутренней сети Compose. Тома `pgdata`, `redisdata`, `telegramdata` сохраняют данные и сессии между перезапусками. Не удаляйте тома при обновлении.

```bash
docker compose --profile app stop
docker compose --profile app up -d --wait
```

## Подключение личного Telegram

1. Получите собственные `api_id` и `api_hash` на https://my.telegram.org/apps.
2. Запишите их в локальный `.env`: `TELEGRAM_API_ID` и `TELEGRAM_API_HASH`. Никому не отправляйте этот файл.
3. Выполните `docker compose --profile app up -d --wait`, чтобы применить настройки.
4. Откройте «Настройки → Личные аккаунты Telegram → Подключить Telegram». Введите телефон, код Telegram и при необходимости пароль 2FA/email **в интерфейсе приложения**. Неподдерживаемые шаги не имитируют успех.
5. После состояния «Подключён» нажмите «Получить список диалогов». В «Диалогах» откройте нужный чат и нажмите «Выбрать для работы». Только после этого CRM загрузит сообщения.

TDLib поставляется через закреплённые npm-пакеты `tdl`/`prebuilt-tdlib`; устанавливать её вручную не нужно. Секретные, защищённые и самоуничтожающиеся сообщения не импортируются. В MVP поддержан текст и ответы на сообщения; вложения показаны как неподдерживаемые. Список ограничен первыми 200 чатами, история загружается страницами до 50 сообщений.

Нажатие «Отправить» создаёт команду в постоянной очереди. Статус «Отправлено» требует подтверждения TDLib. При неизвестном результате автоматического повтора нет: сначала проверьте официальный Telegram. Ошибочную отправку можно повторить вручную; обычный повтор запроса с тем же ключом не создаёт дубль. ИИ не имеет доступа к методу отправки.

Ключ `SESSION_MASTER_KEY` шифрует сессии и журнал сообщений Gateway. Сохраняйте его вместе с защищённой резервной копией и не меняйте при обычном обновлении. «Отключить» выполняет logout и удаляет локальную сессию и сохранённую переписку этого подключения.

## Настройка AI

В `.env` доступны `AI_PROVIDER=disabled|demo|openai`. Значение `demo` использует явно подписанные синтетические правила без LLM. Для настоящего OpenAI-compatible провайдера:

```dotenv
AI_PROVIDER=openai
AI_API_KEY=your-private-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4.1-mini
```

Ключ вводится только в локальный `.env`/секреты сервера. Провайдер должен поддерживать `/chat/completions` и Structured Outputs (`json_schema`). После изменения настроек пересоздайте API через Compose up. Настоящая совместимость конкретного провайдера требует проверки с вашим ключом; тесты используют отдельный HTTP fixture.

Анализ разрешён только для `source=DEMO`, `mode=CLIENT`. Выбор Telegram-чата для CRM **не** разрешает передачу в LLM; универсального флага обхода нет. Рекомендации имеют версии контекста, три тона, подтверждённые факты с ID сообщений и пометку устаревания. Вставьте текст в поле ввода, отредактируйте и отправьте вручную. Применение рекомендации и фактическая отправка учитываются отдельно.

Токены сохраняются из ответа провайдера. Стоимость неизвестна, пока не заданы `AI_INPUT_COST_PER_MILLION` и `AI_OUTPUT_COST_PER_MILLION`; отсутствие usage не выдаётся за нулевое потребление.

## Разработка и тесты

Стек: Node.js 24, TypeScript, npm workspaces, Next.js 16/React 19/Tailwind, NestJS 11, Prisma 7 + pg adapter, PostgreSQL, Redis/BullMQ, Socket.IO, TDLib. Общие DTO/Zod-контракты — `packages/shared`, БД — `packages/database`, UI — `packages/ui`, приложения — `apps/web`, `apps/api`, `apps/telegram-gateway`.

```bash
npm ci
npm run env:init
npm run infra:up
npm run db:migrate
npm run dev
```

`predev` генерирует Prisma-клиент и собирает общие пакеты. Web работает на 3000, API на 4000, Gateway на 4101. Для разработки Telegram-ключи необязательны: Gateway загружает TDLib, а UI объясняет недостающую конфигурацию. Если раньше запускали полный Compose, остановите его `web api telegram-gateway` перед host dev, сохранив PostgreSQL/Redis.

```bash
npm run build
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
```

Для e2e нужен `npx playwright install --with-deps chromium` или системный Chromium. Интеграционные тесты и браузерные тесты используют отдельные базы с суффиксом `_test`; тесты не очищают рабочую БД. Локальному пользователю БД нужен CREATEDB либо заранее созданные тестовые базы. Проверяются настоящие PostgreSQL/Redis/BullMQ, изоляция Workspace, политика данных, идемпотентность, Structured Outputs и браузерные действия. TDLib protocol fixtures явно отделены от живой авторизации.

Миграции выполняет `scripts/migrate.mjs` с транзакциями, advisory lock и checksum ledger `_sales_migrations`. Применённые SQL-файлы не меняйте. Prisma Migrate не используется; `prisma migrate deploy` не заменяет этот runner. Обновление MVP добавляет таблицы, сохраняя учётные записи Foundation.

## Production и дальнейшая работа

Для публичного запуска необходимы HTTPS ingress, точный `WEB_ORIGIN`, `COOKIE_SECURE=true`, `API_NODE_ENV=production`, закрытая сеть DB/Redis/Gateway, отдельные migration/runtime DB users, backup/restore и независимый security review. Текущая локальная Compose-конфигурация не является готовым SaaS-развёртыванием. Инструкции по среде — [ENVIRONMENT.md](ENVIRONMENT.md), границы компонентов — [ARCHITECTURE.md](ARCHITECTURE.md), оставшиеся задачи — [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
