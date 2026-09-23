@echo off
cd /d %~dp0

if not exist venv (
    echo Dang tao moi truong ao Python...
    python -m venv venv
)

call venv\Scripts\activate.bat

echo Dang cai dat thu vien...
pip install -q -r requirements.txt

echo.
echo Khoi dong FinMind AI API tai http://localhost:8000
echo Tai lieu API: http://localhost:8000/docs
echo.
uvicorn main:app --reload --port 8000
