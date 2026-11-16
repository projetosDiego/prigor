@echo off
rem Atualiza dependencias e banco do site depois de receber arquivos novos.
rem De dois cliques neste arquivo (com o "npm run dev" parado).
cd /d "%~dp0"
echo.
echo == Instalando dependencias ==
call npm install || goto erro
echo.
echo == Gerando o cliente do banco ==
call npx prisma generate || goto erro
echo.
echo == Aplicando mudancas do banco ==
call npx prisma migrate deploy || goto erro
echo.
echo Tudo certo. Agora rode: npm run dev
pause
exit /b 0
:erro
echo.
echo Algo deu errado. Copie a mensagem acima e mande para o Claude.
pause
exit /b 1
