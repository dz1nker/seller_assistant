@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title Sales Copilot — восстановление доступа к БД
cd /d "%~dp0"

if not exist ".env" goto missing_env
if not exist "scripts\repair-db-auth.sh" goto missing_script

echo Восстановление доступа Sales Copilot к PostgreSQL.
echo Пароль роли БД будет приведён к POSTGRES_PASSWORD из текущего .env.
echo Таблицы, аккаунты и переписки сохраняются. Значения .env не меняются.
echo.
set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
docker compose up -d --wait postgres redis
if errorlevel 1 goto failed

docker compose exec -T postgres sh < "scripts\repair-db-auth.sh"
if errorlevel 1 goto repair_failed

echo Запускаем уже собранные образы. Повторной сборки не требуется.
docker compose --profile app up -d --no-build --wait --wait-timeout 180
if errorlevel 1 goto startup_failed

echo Готово. Открываем вход: http://localhost:3000/login
start "" "http://localhost:3000/login"
pause
exit /b 0

:missing_env
echo Файл .env не найден. Используйте папку установленного проекта с его .env.
goto failed
:missing_script
echo Файл scripts\repair-db-auth.sh не найден. Распакуйте весь обновлённый архив проекта.
goto failed
:repair_failed
echo PostgreSQL не разрешил восстановление через локальное соединение.
echo Проверьте исходный .env и права администратора БД. Способ входа не менялся.
goto failed
:startup_failed
echo Пароль восстановлен, но запуск приложения завершился ошибкой.
echo Выполните docker compose logs --tail=80 api и пришлите журнал без .env.
goto failed
:failed
echo Данные и тома проекта не удалялись.
pause
exit /b 1
