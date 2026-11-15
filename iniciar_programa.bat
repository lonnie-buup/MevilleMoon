@echo off
setlocal
cd /d "%~dp0"

echo Iniciando Meville Moon...
echo No cierres esta ventana mientras uses el sitio.
echo Abre http://127.0.0.1:8000 en el navegador cuando el servidor este listo.
echo.

if exist "%~dp0.venv\Scripts\python.exe" (
    "%~dp0.venv\Scripts\python.exe" "%~dp0app.py"
) else (
    python "%~dp0app.py"
)

if errorlevel 1 (
    echo.
    echo No se pudo iniciar el servidor. Verifica Python y las dependencias de requirements.txt.
    pause
)
