@echo off
REM ============================================================
REM  Restaurant POS - Clean Deploy (bulletproof)
REM  Fixes the stuck-git-lock problem, removes the token file
REM  from the repo, wipes old history, and pushes one clean commit.
REM ============================================================
setlocal
cd /d "%~dp0"
echo.
echo === Restaurant POS - Clean Deploy ===
echo Folder: %CD%
echo.

REM 1) Kill any hung git process that is holding lock files (the real blocker)
echo Releasing any stuck git process...
taskkill /F /IM git.exe >nul 2>&1
timeout /t 1 >nul

REM 2) Move your secrets file OUT of the repo folder (kept as a backup, not deleted)
if exist ".env.txt" (
    echo Moving .env.txt out of the repo to a backup...
    move /y ".env.txt" "%USERPROFILE%\Documents\restaurant-pos-env-backup.txt" >nul 2>&1
)

REM 3) Make sure it stays ignored even if a copy reappears
findstr /x /c:".env.txt" .gitignore >nul 2>&1 || echo .env.txt>> .gitignore
findstr /x /c:"*.env.txt" .gitignore >nul 2>&1 || echo *.env.txt>> .gitignore

REM 4) Wipe ALL old git history (this is what holds the token) + any stale locks
if exist ".git" rmdir /s /q ".git"

REM 5) Fresh repo, one clean commit (no secret anywhere)
git init
git branch -M main
git add -A
git -c user.email=gopalvserve@gmail.com -c user.name="Gopal V" commit -m "Restaurant POS: Zomato/Swiggy full order-detail sync, payload logging, IST + order status, v8.1 extension"

REM 6) Push
git remote add origin https://github.com/gopalvserve-rgb/restaurant-pos.git
echo.
echo === Pushing to GitHub (sign in if a window appears) ===
git push -u origin main --force

if errorlevel 1 (
    echo.
    echo [ERROR] Still failed. Copy the message above and paste it to Claude.
) else (
    echo.
    echo === SUCCESS! Pushed clean. Railway will rebuild in ~1-2 min. ===
    echo Your secrets file is safe at: %USERPROFILE%\Documents\restaurant-pos-env-backup.txt
    echo Tell Claude "pushed" and it will verify the live site.
)
echo.
pause
