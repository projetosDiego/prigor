@echo off
REM ============================================================
REM  DOCES PRIGOR OS - INICIALIZADOR DO ECOSSISTEMA
REM  Usa caminhos relativos: funciona de qualquer pasta.
REM ============================================================
title Doces Prigor OS - Inicializador do Ecossistema
chcp 65001 >nul

set "FRONT_DIR=%~dp0"
set "ERP_DIR=%~dp0..\erp - Copia"

echo ============================================================
echo   DOCES PRIGOR OS - INICIALIZADOR DO ECOSSISTEMA
echo ============================================================
echo.

if not exist "%ERP_DIR%\iniciar.bat" (
    echo [ERRO] Nao achei o ERP em:
    echo        %ERP_DIR%
    echo        O ERP precisa estar na pasta irma "erp - Copia".
    pause
    exit /b 1
)

echo [1/3] Garantindo que o Banco de Dados (Docker) esteja ativo...
cd /d "%FRONT_DIR%"
docker compose up -d
if errorlevel 1 (
    echo.
    echo [AVISO/ERRO] Certifique-se de que o Docker Desktop esta aberto e verde!
    echo.
    pause
    exit /b 1
)
echo.

echo [2/3] Iniciando o Backend ERP (FastAPI)...
start "Backend - ERP Doces Prigor" cmd /c "cd /d ""%ERP_DIR%"" && iniciar.bat"
echo.

echo [3/3] Iniciando o Frontend (Next.js)...
cd /d "%FRONT_DIR%"
start "Frontend - Doces Prigor OS" cmd /c npm run dev
echo.

echo ============================================================
echo   ECOSSISTEMA INICIADO!
echo.
echo   - Painel Integrado (Next.js): http://localhost:3000
echo   - API Backend (FastAPI): http://localhost:8000
echo.
echo   Abrindo o painel principal no navegador em 5 segundos...
echo ============================================================
timeout /t 5
start "" "http://localhost:3000"
