@echo off
cd /d "%~dp0"
echo Universal AI Switcher - local connection
echo Keep this window open while using the website.
echo Pair your browser at http://127.0.0.1:47831/pair
node bridge\server.cjs
pause
