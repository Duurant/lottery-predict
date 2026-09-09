# Register the Windows scheduled task "LotteryDataSync": daily at
# 09:40 / 12:40 / 15:40 / 18:40 / 22:10 (local time) it runs
# scripts/sync-data.cmd, which fetches lottery draw data and pushes it
# (Vercel redeploys automatically).
#
# Why local: the official sporttery/cwl APIs block datacenter IPs used by
# GitHub Actions runners (HTTP 567 / 403). CI runs only as a freshness
# watchdog and cannot fetch the data itself.
#
# Re-running this script overwrites the existing task (-Force).
# Uninstall: Unregister-ScheduledTask -TaskName LotteryDataSync
# Log file:   %USERPROFILE%\lottery-sync.log

$repo = "D:\Work\整理库\11-代码项目\大乐透双色球"
$times = @('09:40', '12:40', '15:40', '18:40', '22:10')

$action = New-ScheduledTaskAction -Execute "$repo\scripts\sync-data.cmd"
$triggers = $times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'LotteryDataSync' -Action $action -Trigger $triggers `
  -Settings $settings -Force | Out-Null

Write-Host "Scheduled task 'LotteryDataSync' registered, daily at: $($times -join ' / ')"
Write-Host 'Missed runs (PC was off) are started when the PC becomes available (StartWhenAvailable).'
Write-Host 'Log file: %USERPROFILE%\lottery-sync.log'
