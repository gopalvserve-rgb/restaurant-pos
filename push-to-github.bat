@echo off
REM Push restaurant-pos to GitHub - double-click this file
setlocal

cd /d "%~dp0"
echo.
echo === Restaurant POS - GitHub Push ===
echo Folder: %CD%
echo.

REM Check git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed. Download from https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Set git identity locally (needed for commits, harmless if already set globally)
git config user.email "gopalvserve@gmail.com"
git config user.name "Gopal V"

REM Initialize git if needed
if not exist ".git" (
    echo Initializing git repo...
    git init
    git branch -M main
) else (
    git branch -M main 2>nul
)

REM Set remote (replace if exists)
git remote remove origin 2>nul
git remote add origin https://github.com/gopalvserve-rgb/restaurant-pos.git

REM Stage all files
echo.
echo Staging files...
git add -A

REM Commit (show errors this time)
echo.
echo Committing...
git commit -m "Initial commit - Restaurant POS with PWA"
if errorlevel 1 (
    echo [INFO] Nothing new to commit, or commit failed. Continuing to push existing commits.
)

REM Verify we have at least one commit
git log -1 --oneline >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] No commits in local repo. Cannot push.
    echo Check above output for git errors.
    pause
    exit /b 1
)

echo.
echo === Pushing to GitHub ===
echo If a sign-in popup appears, sign in to GitHub.
echo.
git push -u origin main --force

if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Check the error above.
    echo Common fixes:
    echo  - If auth failed, run this bat again and sign in when prompted
    echo  - If "remote rejected", contact me for help
) else (
    echo.
    echo === SUCCESS! ===
    echo View your repo at: https://github.com/gopalvserve-rgb/restaurant-pos
)
echo.
pause
