@echo off
chcp 65001 >nul
title TCHO BURGUER — Atendente WhatsApp
cd /d "%~dp0"

where node >NUL 2>NUL
if errorlevel 1 (
  echo  Node.js nao encontrado. Instalando ^(pode pedir permissao do Windows^)...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  Pronto. Feche esta janela e abra o INICIAR.bat de novo.
  pause
  exit /b
)

if not exist node_modules (
  echo  Instalando dependencias ^(so na primeira vez, demora uns minutos^)...
  call npm install --omit=dev
)

:inicio
echo.
echo  Buscando atualizacao da biblioteca do WhatsApp...
call npm update whatsapp-web.js --omit=dev --no-fund --no-audit
echo.
echo  Iniciando o atendente de WhatsApp... Nao feche esta janela!
echo.
node index.js
if %errorlevel%==3 goto fim
echo.
echo  O atendente parou. Reiniciando em 10 segundos ^(feche a janela para desligar^)...
timeout /t 10 >NUL
goto inicio

:fim
pause
