@echo off
setlocal
cd /d "%~dp0"

echo Comprobando el servidor local de Meville Moon...
curl.exe --fail --silent --output NUL http://127.0.0.1:8000/
if errorlevel 1 (
    echo No responde http://127.0.0.1:8000/.
    echo Primero inicia iniciar_programa.bat y deja esa ventana abierta.
    pause
    exit /b 1
)

where cloudflared >nul 2>nul
if errorlevel 1 (
    echo No se encontro cloudflared.
    echo Instala cloudflared para Windows desde:
    echo https://developers.cloudflare.com/tunnel/downloads/
    pause
    exit /b 1
)

echo.
echo Creando un enlace temporal para compartir...
echo Copia la direccion https://...trycloudflare.com que aparezca abajo.
echo Manten abiertas esta ventana y la del servidor mientras compartes la pagina.
echo Pulsa Ctrl+C para cerrar el enlace publico.
echo.
cloudflared tunnel --url http://127.0.0.1:8000
