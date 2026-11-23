@echo off
chcp 65001 >nul
title TCHO BURGUER — Atendente WhatsApp
cd /d "%~dp0"

if not exist node_modules (
  echo  Instalando dependencias ^(so na primeira vez, demora uns minutos^)...
  call npm install
)

:inicio
echo.
echo  Iniciando o atendente de WhatsApp... Nao feche esta janela!
echo.
node index.js
if %errorlevel%==3 goto fim
echo.
echo  O atendente parou. Reiniciando em 10 segundos ^(feche a janela para desligar^)...
timeout /t 10 >nul
goto inicio

:fim
pause
