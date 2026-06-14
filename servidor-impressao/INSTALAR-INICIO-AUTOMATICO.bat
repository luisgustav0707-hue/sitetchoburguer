@echo off
echo Instalando inicio automatico do servidor de impressao...

set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SERVER_PATH=%~dp0

echo [InternetShortcut] > "%STARTUP%\TchoBurguer-Impressao.url"
echo URL=file:///%SERVER_PATH%INICIAR.bat >> "%STARTUP%\TchoBurguer-Impressao.url"

copy /y "%~dp0INICIAR.bat" "%STARTUP%\TchoBurguer-Impressao.bat" >nul

echo.
echo OK! O servidor vai iniciar automaticamente quando o Windows ligar.
echo.
pause
