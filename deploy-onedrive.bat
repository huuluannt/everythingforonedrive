@echo off
echo =======================================
echo     EVERYTHING ONEDRIVE DEPLOY
echo =======================================

cd /d %~dp0

git add .

git diff --cached --quiet
IF %ERRORLEVEL%==0 (
echo No changes detected, forcing deploy...
git commit --allow-empty -m "force deploy %date% %time%"
) ELSE (
git commit -m "fix: resolve Microsoft OAuth iframe login and add premium avatar %date% %time%"
)

git push origin main

echo.
echo DONE! Check Vercel or GitHub Actions Deployments...
pause
