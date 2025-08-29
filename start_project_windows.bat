@echo off
REM Start Backend API and Frontend Demo with root venv activation in Windows Terminal tabs using relative paths
setlocal
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV=%ROOT%venv"

REM Start backend in one tab, frontend in another tab
start wt.exe -w 0 nt -d "%BACKEND%" cmd /k "call %VENV%\Scripts\activate && python main.py" ^
    ; nt -d "%FRONTEND%" cmd /k "call %VENV%\Scripts\activate && python -m http.server 3000"

REM Open frontend site in default browser
start "" "http://localhost:3000/demo.html"
REM Each tab will activate venv from the project root, run in the correct directory, and start the required service.
REM Backend: http://localhost:8000
REM Frontend: http://localhost:3000/demo.html
