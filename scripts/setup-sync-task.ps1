# Register the Windows scheduled task "LotteryDataSync".
#
# Daily at 09:40 / 12:40 / 15:40 / 18:40 / 22:10 / 23:10 (local time) it runs
# scripts/sync-data.cmd: fetch draw data, commit, then pull+push with
# direct-then-proxy(127.0.0.1:7890) retries (Vercel redeploys on push).
#
# Why local: the official sporttery/cwl APIs block datacenter IPs used by
# GitHub Actions runners (HTTP 567 / 403). CI runs only as a freshness
# watchdog and cannot fetch the data itself.
#
# Extra resilience:
#   - AtLogOn trigger    : syncs right after any login (PC may boot at odd hours)
#   - StartWhenAvailable : a missed slot (PC off) runs when the PC comes back
#   - RestartCount 3     : task re-runs itself on failure (network flake)
#   - WakeToRun          : tries to wake a sleeping PC for night draws
#   - AllowStartIfOnBatteries: works on laptops off AC power
#
# Re-running this script overwrites the existing task (-Force).
# Uninstall: Unregister-ScheduledTask -TaskName LotteryDataSync
# Log file:   %USERPROFILE%\lottery-sync.log

$repo = "D:\Work\整理库\11-代码项目\大乐透双色球"
$times = @('09:40', '12:40', '15:40', '18:40', '22:10', '23:10')

$action = New-ScheduledTaskAction -Execute "$repo\scripts\sync-data.cmd"
$triggers = @($times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })
$triggers += New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'LotteryDataSync' -Action $action -Trigger $triggers `
  -Settings $settings -Force | Out-Null

Write-Host "Scheduled task 'LotteryDataSync' registered, daily at: $($times -join ' / ') + at logon"
Write-Host 'Missed slots run when the PC is back (StartWhenAvailable); failed runs retry 3x/5min.'
Write-Host 'Log file: %USERPROFILE%\lottery-sync.log'
