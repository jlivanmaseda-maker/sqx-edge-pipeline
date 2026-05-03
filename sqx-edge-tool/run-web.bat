@echo off
REM SQX Edge Tool — Web server launcher
REM Arranca el API REST + sirve el dashboard estático en http://localhost:5050

cd /d "%~dp0"
echo.
echo ================================================================
echo   SQX Edge Tool — Dashboard + API
echo ================================================================
echo.
echo   Dashboard:    http://localhost:5050/SQX_Dashboard_v6.html
echo   Health API:   http://localhost:5050/api/health
echo.
echo   Pulsa Ctrl+C para detener el servidor.
echo ================================================================
echo.
REM Abre el dashboard en el browser por defecto (delay 2s para que el servidor arranque)
start "" /B cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5050/SQX_Dashboard_v6.html"
python -m api.server %*
pause
