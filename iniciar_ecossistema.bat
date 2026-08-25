@echo off
title Doces Prigor OS - Inicializador do Ecossistema
echo ============================================================
echo   DOCES PRIGOR OS - INICIALIZADOR DO ECOSSISTEMA
echo ============================================================
echo.

echo [1/3] Garantindo que o Banco de Dados (Docker) esteja ativo...
cd /d "c:\Users\igorc\OneDrive\Documents\Leed Doces Prigor"
docker compose up -d
if errorlevel 1 (
    echo.
    echo [AVISO/ERRO] Certifique-se de que o Docker Desktop esta aberto e verde!
    echo.
    pause
    exit /b
)
echo.

echo [2/3] Iniciando o Backend ERP (FastAPI)...
cd /d "c:\Users\igorc\OneDrive\Documents\erp - Copia"
start "Backend - ERP Doces Prigor" cmd /c iniciar.bat
echo.

echo [3/3] Iniciando o Frontend (Next.js)...
cd /d "c:\Users\igorc\OneDrive\Documents\Leed Doces Prigor"
start "Frontend - Doces Prigor OS" cmd /c npm run dev
echo.

echo ============================================================
echo   ECOSSISTEMA INICIADO COM SUCESSO!
echo.
echo   - Painel Integrado (Next.js): http://localhost:3000
echo   - API Backend (FastAPI): http://localhost:8000
echo.
echo   Abrindo o painel principal no seu navegador em 5 segundos...
echo ============================================================
timeout /t 5
start "" "http://localhost:3000"
