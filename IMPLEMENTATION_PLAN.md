# План реализации и статус MVP

Основание — [исходное ТЗ](docs/SPEC.md). Реализован локальный MVP; живые проверки Telegram/LLM остаются отдельным шагом с пользовательскими credentials. Статус не заменяет результаты тестов.

## Реализовано

- [x] Foundation: Node.js 24 monorepo, Next.js/React, NestJS, PostgreSQL/Prisma, Redis, регистрация и защищённые сессии, Workspace/роли, health, Docker и Windows launcher.
- [x] Contact, ContactIdentity, Product, Conversation, Message, Deal, DealConversation, history, AI analysis/suggestions/usage, task/notification и integration metadata.
- [x] Tenant-scoped CRUD, составные foreign keys, additive checksum migrations без изменения применённых SQL.
- [x] Privacy Engine EXCLUDED/CANDIDATE/CLIENT, очистка содержимого и производных данных, retention job.
- [x] Контакты, продукты, эксперт/стиль, текстовая база знаний, явно подписанные синтетические диалоги.
- [x] Несколько воронок, редактирование/перестановка этапов, безопасное удаление с переносом сделок.
- [x] Канбан dnd-kit, integer/hash concurrency versions и общие Pipeline locks, optimistic rollback, история стадий, ручное подтверждение WON.
- [x] Настоящий `apps/telegram-gateway` на tdl/prebuilt TDLib, capability-based ChannelAdapter в shared contracts.
- [x] Phone/code/2FA/email/device auth states, server API credentials, изолированные native encrypted sessions и AES-GCM event outbox.
- [x] Список метаданных чатов, ручной whitelist, история с пагинацией, текст/replies, unsupported attachment placeholders.
- [x] Постоянные command intents, concurrency-safe dedupe, PENDING/SENDING/SENT/FAILED/UNCERTAIN, известный отказ с ручным повтором, неизвестный результат без слепого resend.
- [x] Incoming/outgoing/edit/delete/source confirmation events, включая официальный клиент; event/source dedupe.
- [x] Authenticated Socket.IO tenant rooms, polling/upgrade/reconnect, BullMQ worker с восстановлением из PostgreSQL outbox.
- [x] AI_PROVIDER disabled/demo/openai, OpenAI-compatible Structured Outputs, Zod validation, promptVersion, token usage/nullable cost.
- [x] AI policy: только DEMO + CLIENT; настоящий Telegram не передаётся LLM и не имеет универсального bypass.
- [x] Ограниченный контекст бизнеса/продуктов/знаний/сообщений/сделок, подтверждённые факты с provenance, hash stale detection.
- [x] Резюме, потребности, возражения, неизвестные факты, следующий шаг и три тона ответа; composer edit/manual send.
- [x] Feedback APPLIED/REJECTED и SENT после подтверждения, фиксация редактирования; AI не зависит от MessagesService.
- [x] Реальные задачи, приоритеты, due reminders, дедуплицированные уведомления, завершение/возврат задачи.
- [x] Аналитика реальных сделок/потерь/валют, отдельные demo counts, рекомендации/applied/confirmed sends, unknown usage/cost.
- [x] Критические unit/integration/browser tests и инструкции запуска/обновления.

## Финальная приёмка

- [ ] Проверка реальной авторизации и обмена с Telegram с ключами/аккаунтом пользователя.
- [ ] Проверка выбранной внешней LLM с пользовательским ключом на допустимом синтетическом контексте.
- [ ] Проверка обновлённого launcher на настоящей Windows 10/11.

Отсутствие credentials блокирует только живые проверки. Нативная TDLib проверяется отдельно от protocol fixtures; фиктивная авторизация не выдаётся за настоящий аккаунт.

## После локального MVP

- [ ] File upload/extraction для базы знаний и разрешённые бинарные вложения каналов.
- [ ] Релевантный retriever, развитая deal memory/knowledge ranking и отдельные слои анализа/стратегии.
- [ ] Instagram adapter, контакты/идентичности нескольких платформ; автоматическое объединение по имени запрещено.
- [ ] Более 200 Telegram-чатов, расширенный source reconciliation и UX ручного разбора UNCERTAIN.
- [ ] Фильтры периодов/конверсия по стадиям и расширенные отчёты без AI attribution выручки.
- [ ] Приглашения, переключение Workspace, управление активными сессиями, email verification/reset, account deletion UI.
- [ ] Полный threat model/security review, немедленный отзыв всех sockets при смене членства, координация refresh между вкладками.
- [ ] HTTPS ingress/CSP, runtime DB least privilege, secrets rotation, проверяемые backup/restore и RPO/RTO.
- [ ] Observability, квоты/лимиты/подписки, горизонтальное масштабирование и отдельный migration release job.

Результаты текущей среды и границы проверки — [ENVIRONMENT.md](ENVIRONMENT.md), безопасность — [SECURITY.md](SECURITY.md).
