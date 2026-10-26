# Среда разработки

Рабочая директория в текущей облачной задаче: `/workspace/seller_assistant`. Задача уже изолирована: используйте существующий checkout, не создавайте Git worktree без прямого запроса пользователя.

## Повторная установка

На хосте доступны Node.js 24, npm, Docker/Compose, системный Chromium. Дополнительная установка системных пакетов для Foundation не нужна.

```bash
cd /workspace/seller_assistant
bash scripts/cloud-install.sh
```

Скрипт использует `npm ci` с cache в writable `/workspace`, сохраняет существующий `.env`, поднимает и ждёт PostgreSQL/Redis, применяет миграции и собирает оба приложения. Генерация Prisma/WASM и общих пакетов включена в `npm run build`.

Установка не создаёт стандартного пользовательского аккаунта и не требует Telegram/LLM ключей. Для входа используйте регистрацию. Необходимые локальные пароли сервисов создаются `env:init`; не переносите их в код или инструкции. Секреты будущих интеграций вводятся в защищённых настройках среды, не в переписке с Codex.

## Запуск после восстановления snapshot

Живые процессы не считаются сохранёнными. Для работы над кодом:

```bash
cd /workspace/seller_assistant
docker compose up -d --wait postgres redis
npm run db:migrate
npm run dev
```

Запускайте dev в длительной shell-сессии инструмента. Next работает на 3000, API на 4000. Проверяйте внутренним запросом `GET /api/health/ready` через порт web: ожидается `status=ok,database=up,redis=up`. Затем проверьте страницу login и функциональный вход/регистрацию. Не создавайте публичные preview-ссылки на localhost.

Если ранее запускали полный app-профиль Compose и порт 3000 занят, остановите **только собственные** контейнеры `docker compose stop web api` перед запуском dev; оставьте PostgreSQL/Redis и их данные. Для полного контейнерного запуска смотрите README.

## Сеть и доверие

Хостовые зависимости используют `registry.npmjs.org` и доверенную конфигурацию прокси платформы. Docker pull использует штатный daemon proxy и Docker registry domains. Для обычной локальной установки достаточно `docker compose --profile app build`.

В этой облачной среде build-контейнерам нужно отдельно передать прокси/DNS alias и публичный доверенный CA. Для этого:

```bash
node scripts/cloud-docker-build.mjs
docker compose --profile app up -d --no-build --wait
```

Скрипт получает существующие bindings прокси и путь к CA платформы, передаёт predefined build-args по имени, public CA — через BuildKit secret, и использует Linux host build networking. Значения не сохраняются в репозитории, build history или образе. Он не отключает TLS/signature verification. Скрипт предназначен для Linux cloud; обычный локальный Compose не требует его.

Обычный Prisma CLI пытался получить нативный engine/checksum с `binaries.prisma.sh` и получил 403 от egress proxy. Этот домен добавлен в черновик сетевых настроек для возможных последующих CLI-операций. Foundation не блокируется этим отказом: генератор клиента использует npm-delivered WASM, миграции — SQL-runner с checksum ledger. Не устанавливайте `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `strict-ssl=false` или неподтверждённые mirrors.

Для browser e2e здесь используется системный Chromium:

```bash
PLAYWRIGHT_NO_SANDBOX=true npm run test:e2e
```

Флаг относится только к браузеру тестов в изолированной среде, не к серверной авторизации. На обычном хосте используйте Chromium sandbox по умолчанию. Если системного браузера нет, установите `npx playwright install chromium`; для скачивания нужны официальные Playwright CDN, которые добавляются в settings по фактической необходимости.

## Хранение и восстановление

Исходники, lockfile, node_modules, сгенерированный клиент и сборки находятся в checkout. Локальный `.env` игнорируется Git. PostgreSQL/Redis используют постоянные Docker volumes; они сохраняются при stop/restart и обычном Compose down без `-v`. Не предполагайте переносимость Docker volumes между разными облачными машинами: после публикации требуется отдельная проверка восстановления, для реальных данных — проверенные backup/restore или внешняя БД.

В черновике подтверждено сохранение `install_script`, `start_skill` и дополнительного домена `binaries.prisma.sh`. Инструкции проверены в текущей машине; сохранение само их не выполняет и не публикует среду. Публикация выполняется пользователем в настройках после просмотра и сохранения изменений. Проверка в текущей машине не подтверждает восстановление в новой задаче.

Docker в этой среде использует storage driver vfs и расходует много места при повторных сборках. После проверки потребовалась очистка созданного задачей BuildKit-cache и устаревших образов. Тома и данные PostgreSQL/Redis сохранены. Не очищайте чужие Docker-артефакты; повторная полная сборка требует контроля свободного диска.

## Проверенные результаты

21 октября 2026, текущая машина:

- PostgreSQL 17 и Redis 7 проходят health checks.
- Генерация Prisma JavaScript/WASM и SQL-миграция выполнены; повторное применение без изменений успешно.
- API/web проходят production build; весь TypeScript, включая UI и тесты, проверяется отдельно.
- 9 unit, 18 интеграционных тестов с настоящими PostgreSQL/Redis и 5 Chromium e2e прошли.
- Seed выполнен дважды на отдельной тестовой БД, структура проверена, временная identity удалена.
- `npm audit` не обнаружил уязвимостей в установленном lockfile.

GitHub CI workflow создан, но выполнение на GitHub пока не подтверждено. Telegram/LLM не подключались и не проверялись. Полный Compose прошёл health checks. В Chromium проверены регистрация и запись настроек через контейнерный web/API; после restart API/web сохранились сессия и Workspace. Настоящая остановка Redis дала readiness 503, повторный запуск восстановил авторизованный доступ. Временный smoke-аккаунт удалён.

Повторный запуск scripts/cloud-install.sh с чистой установкой npm ci и существующим .env/БД завершился успешно; существующие данные и настройки сохранены.

## Облегчённые контейнеры: проверка 26 октября 2026

Предыдущие рабочие образы включали зависимости всего monorepo. Dockerfile теперь отделяет build-stage от runtime: API получает production-зависимости и готовые JS/Prisma/SQL-файлы, web — Next.js standalone со статическими файлами. npm cache остаётся в BuildKit cache mount. Документы, тесты и CI-конфигурация исключены из build context. Для host/dev сборки standalone не включается; флаг `SALES_DOCKER_STANDALONE=true` задаётся в Docker build.

По `docker image inspect .Size` в текущей Linux cloud API уменьшился с 1534 до 351 МБ, web — с 1586 до 298 МБ; вместе примерно на 79%. Это несжатый размер готовых образов, не обещание конкретного времени скачивания/экспорта на Windows. На машине пользователя задержку также могут вызывать ресурсы Docker и скорость/свободное место диска.

Проверены сборка обоих образов, TypeScript frontend, Compose config и запуск четырёх сервисов с health checks. В API runtime проверено отсутствие Next.js, TypeScript, Vitest, Playwright и Prisma CLI. Chromium выполнил регистрацию, запись бизнес-настроек, чтение после restart API/web; остановка Redis дала readiness 503, повторный запуск восстановил авторизованный доступ. Созданный smoke-аккаунт удалён. Схема и сохранённые данные не изменялись; существующий `.env` сохраняется.
