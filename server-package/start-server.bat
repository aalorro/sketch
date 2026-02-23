@echo off
cd C:\Users\arman\OneDrive\repos\sketch
call .venv\Scripts\activate.bat
start "Sketch Web Server" python -m http.server 8000
start "Sketch Flask Server" python server_advanced.py
pause