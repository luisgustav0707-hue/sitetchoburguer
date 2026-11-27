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

:inicio
rem Versao nova baixada pelo atualizar.ps1: troca este .bat e reabre.
rem (O bloco inteiro e lido antes de rodar, entao trocar o arquivo aqui e seguro.)
if exist "%~dp0INICIAR.novo" (
  move /y "%~dp0INICIAR.novo" "%~dp0INICIAR.bat" >NUL
  start "" "%~dp0INICIAR.bat"
  exit
)
echo.
echo  Procurando versao nova do atendente...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar.ps1"
if exist "%~dp0INICIAR.novo" goto inicio
rem Atalho com icone na Area de Trabalho + abrir sozinho quando o PC liga.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atalhos.ps1"
echo.
echo  Conferindo dependencias ^(na primeira vez demora uns minutos^)...
call npm install --omit=dev --no-fund --no-audit
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
