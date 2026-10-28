@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title Sales Copilot — установка и запуск
cd /d "%~dp0"

echo.
echo Sales Copilot — установка и запуск
echo Node.js отдельно устанавливать не нужно.
echo.

if not exist "docker-compose.yml" goto missing_project
if not exist "scripts\init-env.mjs" goto missing_project

rem Docker Desktop can be installed before its directory reaches this process's PATH.
set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
where docker >nul 2>&1
if not errorlevel 1 goto check_compose

where winget >nul 2>&1
if errorlevel 1 goto missing_winget
echo Устанавливаем Docker Desktop через официальный каталог WinGet.
echo Windows может запросить разрешение администратора.
winget install --id Docker.DockerDesktop --exact --source winget --accept-source-agreements --accept-package-agreements
set "INSTALL_CODE=%ERRORLEVEL%"
if "%INSTALL_CODE%"=="3010" goto reboot_required
if not "%INSTALL_CODE%"=="0" goto install_failed

set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
where docker >nul 2>&1
if errorlevel 1 goto restart_launcher

:check_compose
docker compose version >nul 2>&1
if errorlevel 1 goto missing_compose
docker info >nul 2>&1
if not errorlevel 1 goto check_linux

echo Запускаем Docker Desktop. Дождитесь завершения его настройки.
echo Если Docker попросит перезагрузку, перезагрузите компьютер и запустите этот файл снова.
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
set "WAIT_ATTEMPTS=0"

:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto check_linux
set /a WAIT_ATTEMPTS+=1 >nul
if %WAIT_ATTEMPTS% GEQ 60 goto docker_not_ready
timeout /t 5 /nobreak >nul
goto wait_docker

:check_linux
powershell.exe -NoProfile -Command "$modeOutput=@(& docker info --format '{{.OSType}}'); $modeExit=$LASTEXITCODE; if ($modeExit -ne 0) { exit 20 }; $mode=[string]::Join('', $modeOutput).Trim(); Write-Host ('Docker Engine: ' + $mode); if ($mode -ieq 'linux') { exit 0 }; if ($mode -ieq 'windows') { exit 10 }; exit 30"
set "DOCKER_MODE_EXIT=%ERRORLEVEL%"
if "%DOCKER_MODE_EXIT%"=="10" goto linux_required
if not "%DOCKER_MODE_EXIT%"=="0" goto docker_mode_failed

echo Проверяем настройки. Существующие пароли сохраняются.
docker run --rm -v "%CD%:/project" -w /project node:24-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 node scripts/init-env.mjs
if errorlevel 1 goto configuration_failed

:start_project
docker compose --profile app config --quiet
if errorlevel 1 goto configuration_failed
echo.
echo Собираем и запускаем приложение. Первый запуск может занять несколько минут.
docker compose --profile app up -d --build --wait --wait-timeout 180
if errorlevel 1 goto startup_failed

echo Проверяем подключение приложения к PostgreSQL и Redis.
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; try { $r=Invoke-RestMethod -Uri 'http://localhost:3000/api/health/ready' -TimeoutSec 30; if ($r.status -ne 'ok' -or $r.database -ne 'up' -or $r.redis -ne 'up') { exit 1 }; exit 0 } catch { exit 1 }"
if errorlevel 1 goto startup_failed

echo.
echo Готово. Открываем регистрацию: http://localhost:3000/register
echo Для следующего запуска используйте этот же файл.
echo Закрытие окна не останавливает приложение. Для остановки есть STOP_WINDOWS.cmd.
start "" "http://localhost:3000/register"
pause
exit /b 0

:missing_project
echo Распакуйте ВЕСЬ архив проекта и запустите START_WINDOWS.cmd из распакованной папки.
goto failed

:missing_winget
echo Docker не найден, а WinGet недоступен на этом компьютере.
echo Установите Docker Desktop с официальной страницы:
echo https://www.docker.com/products/docker-desktop/
echo Затем запустите START_WINDOWS.cmd снова.
goto failed

:install_failed
echo Установка Docker завершилась с кодом %INSTALL_CODE%.
echo Если установщик запросил перезагрузку, перезагрузите Windows и запустите файл снова.
echo Если установка не началась, установите Docker Desktop с https://www.docker.com/products/docker-desktop/
goto failed

:reboot_required
echo Установке Docker требуется перезагрузка Windows.
echo Сохраните работу, перезагрузите компьютер и запустите START_WINDOWS.cmd снова.
goto failed

:restart_launcher
echo Docker установлен, но его команда пока недоступна этому окну.
echo Закройте окно и запустите START_WINDOWS.cmd снова. При запросе установщика перезагрузите Windows.
goto failed

:missing_compose
echo Нужен Docker Desktop с Docker Compose v2. Обновите Docker Desktop и повторите запуск.
goto failed

:docker_not_ready
echo Docker Desktop ещё не готов. Откройте его окно и завершите начальную настройку.
echo При сообщении о WSL или виртуализации следуйте инструкции Docker Desktop.
echo После настройки или перезагрузки запустите START_WINDOWS.cmd снова.
goto failed

:linux_required
echo Docker Engine сообщил режим windows.
echo Проекту нужен режим Linux containers в Docker Desktop.
echo Переключите Docker Desktop в этот режим и запустите файл снова.
goto failed

:docker_mode_failed
echo Не удалось определить режим Docker Engine. Это не означает, что включены Windows containers.
echo Посмотрите строку Docker Engine или ошибку команды выше и пришлите снимок этого окна.
goto failed

:configuration_failed
echo Не удалось подготовить настройки. Посмотрите сообщение об ошибке выше.
echo Существующие значения .env сохранены. Не отправляйте его содержимое или пароли в чат.
goto failed

:startup_failed
echo Не удалось запустить приложение. Посмотрите сообщение об ошибке выше.
echo Проверьте, что порты 3000, 5432 и 6379 не заняты другими программами.
echo Можно прислать текст ошибки, но не .env и не пароли.
goto failed

:failed
echo.
echo Данные проекта не удалялись. После исправления можно повторить запуск.
pause
exit /b 1
