@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
if not exist "docker-compose.yml" goto failed
docker compose --profile app stop
if errorlevel 1 goto failed
echo Приложение остановлено. Данные и настройки сохранены.
pause
exit /b 0
:failed
echo Не удалось остановить приложение. Убедитесь, что Docker Desktop запущен.
pause
exit /b 1
