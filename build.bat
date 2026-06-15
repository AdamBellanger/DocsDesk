@echo off
REM ============================================================
REM  DocsDesk — build de l'executable Windows autonome
REM  Genere dist\DocsDesk.exe (a distribuer aux collegues)
REM  Prerequis : Python 3.11+, Node 18+ installes
REM ============================================================
setlocal
cd /d "%~dp0"

echo [1/4] Dependances Python...
python -m pip install -r requirements.txt || goto :err

echo [2/4] Dependances frontend...
cd frontend
call npm install || goto :err

echo [3/4] Build du frontend (frontend_dist)...
call npm run build || goto :err
cd ..

echo [4/4] Packaging PyInstaller...
python -m PyInstaller --noconfirm --clean build_exe.spec || goto :err

echo.
echo ============================================================
echo  OK : dist\DocsDesk.exe
echo ============================================================
echo  LibreOffice doit etre installe sur le poste cible
echo  (conversion Word/Excel). Images et PDF fonctionnent sans.
echo ============================================================
goto :eof

:err
echo.
echo *** ECHEC du build — voir les messages ci-dessus ***
exit /b 1
