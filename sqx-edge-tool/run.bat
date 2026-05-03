@echo off
REM SQX Edge Tool — CLI launcher
REM Uso:
REM   run.bat list
REM   run.bat generate --mining 2
REM   run.bat generate-all
REM   run.bat info

cd /d "%~dp0"
python -m cli.sqx_edge %*
