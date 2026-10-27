@echo off
cd /d "%~dp0"
echo Universal AI Switcher - private connection link
echo Paste the link copied from your Universal account. No pairing page is needed.
node bridge\link-install.cjs --manual
pause
