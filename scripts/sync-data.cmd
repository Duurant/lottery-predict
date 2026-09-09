@echo off
rem Scheduled sync of lottery draw data: fetch -> commit data/*.json -> push
rem (Vercel redeploys automatically on push). Invoked by the Windows scheduled
rem task "LotteryDataSync"; register it with scripts/setup-sync-task.ps1.
rem
rem Why local: the official sporttery/cwl APIs block datacenter IPs used by
rem GitHub Actions runners (HTTP 567 / 403), so CI can only act as a freshness
rem watchdog; actual fetching must run on a residential network.
rem GitHub connectivity from CN networks is flaky, so pull/push retry 3 times.
setlocal enabledelayedexpansion
rem Repo root = parent of the scripts\ folder this file lives in (keeps this
rem file ASCII-only; the real path contains non-ASCII characters)
set REPO=%~dp0..
set LOG=%USERPROFILE%\lottery-sync.log

cd /d "%REPO%" || exit /b 1
>>"%LOG%" echo ===== %date% %time% =====

set /a tries=0
:pull
rem --autostash keeps the rebase working even with uncommitted local changes
git pull --rebase --autostash origin main >>"%LOG%" 2>&1
if errorlevel 1 (
  set /a tries+=1
  if !tries! lss 3 (
    >>"%LOG%" echo pull failed attempt !tries!/3, retrying in 15s
    ping -n 16 127.0.0.1 >nul
    goto pull
  )
  >>"%LOG%" echo pull failed after 3 attempts, trying to abort an in-progress rebase
  git rebase --abort >>"%LOG%" 2>&1
  exit /b 1
)

rem Do not abort on fetch failure: when one game's API fails the other game's
rem data is already written, so still commit whatever we got
npm run fetch >>"%LOG%" 2>&1

git add data/dlt.json data/ssq.json
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore(data): scheduled sync of draw data" >>"%LOG%" 2>&1
  set /a tries=0
  :push
  git push origin main >>"%LOG%" 2>&1
  if errorlevel 1 (
    set /a tries+=1
    if !tries! lss 3 (
      >>"%LOG%" echo push failed attempt !tries!/3, retrying in 15s
      ping -n 16 127.0.0.1 >nul
      goto push
    )
    >>"%LOG%" echo push failed after 3 attempts, will retry on next scheduled run
    exit /b 1
  )
)
>>"%LOG%" echo sync done
endlocal
