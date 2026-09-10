@echo off
rem Scheduled sync of lottery draw data. Order matters:
rem   1) fetch + commit locally FIRST - lottery APIs do not depend on github,
rem      so data is captured even while github is unreachable
rem   2) pull --rebase + push, each retried direct then via the local proxy
rem If pull/push keep failing the data stays committed locally and the next
rem scheduled run publishes it.
rem Invoked by the Windows scheduled task "LotteryDataSync"
rem (register with scripts/setup-sync-task.ps1). Log: %USERPROFILE%\lottery-sync.log
setlocal enabledelayedexpansion
rem Repo root = parent of the scripts\ folder this file lives in (keeps this
rem file ASCII-only; the real path contains non-ASCII characters)
set REPO=%~dp0..
set LOG=%USERPROFILE%\lottery-sync.log
set PROXY=http://127.0.0.1:7890

cd /d "%REPO%" || exit /b 1
>>"%LOG%" echo ===== %date% %time% =====

rem Fetch first: never let github connectivity block data collection.
rem NOTE: npm is npm.cmd on Windows - WITHOUT "call" control transfers to it
rem permanently and this script would end right here (never commit/push)
call npm run fetch >>"%LOG%" 2>&1

git add data/dlt.json data/ssq.json
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore(data): scheduled sync of draw data" >>"%LOG%" 2>&1
)

call :git_retry pull --rebase --autostash origin main
if errorlevel 1 exit /b 1
call :git_retry push origin main
if errorlevel 1 exit /b 1
>>"%LOG%" echo sync done
endlocal
exit /b 0

rem ---- git op with 2 direct attempts, then local-proxy fallback ----
rem usage: call :git_retry push origin main
:git_retry
set /a tries=0
:gr_direct
git %* >>"%LOG%" 2>&1
if not errorlevel 1 goto :eof
set /a tries+=1
if !tries! lss 2 (
  >>"%LOG%" echo git %* failed, retrying in 10s
  ping -n 11 127.0.0.1 >nul
  goto gr_direct
)
rem FClash/Clash usually listens on 127.0.0.1:7890; use it only when present
netstat -ano 2>nul | findstr /C:":7890 " | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  >>"%LOG%" echo git %* failed twice, no local proxy on 7890, giving up for this run
  exit /b 1
)
>>"%LOG%" echo direct git %* failed, retrying via %PROXY%
git -c http.proxy=%PROXY% %* >>"%LOG%" 2>&1
if errorlevel 1 exit /b 1
goto :eof
