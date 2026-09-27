param([Parameter(Mandatory=$true)][string]$Workspace,[Parameter(Mandatory=$true)][string]$RunDirectory,[int]$CpuPercent=20,[string]$Controller='scripts/run-low-cpu-troop-acceptance.mjs')
$ErrorActionPreference='Stop'
$Workspace=(Resolve-Path -LiteralPath $Workspace).Path
$RunDirectory=(Resolve-Path -LiteralPath $RunDirectory).Path
Set-Location -LiteralPath $Workspace
Add-Type -Path (Join-Path $PSScriptRoot 'AcceptanceCpuJob.cs')
$jobName='Local\Match3Acceptance-'+$PID
$job=[AcceptanceCpuJob]::Create($jobName,$CpuPercent)
$verifiedCap=[AcceptanceCpuJob]::ReadCap($job)
# Include the hidden console host created before the wrapper joined its job.
Get-CimInstance Win32_Process -Filter "ParentProcessId=$PID AND Name='conhost.exe'" | ForEach-Object { [AcceptanceCpuJob]::Attach($job,[int]$_.ProcessId) }
$env:ACCEPTANCE_CPU_RUN_DIR=$RunDirectory
$env:ACCEPTANCE_CPU_CAP_PERCENT=[string]$verifiedCap
$env:ACCEPTANCE_CPU_JOB_NAME=$jobName
$utf8=[Text.UTF8Encoding]::new($false)
function WriteJson($Name,$Value){[IO.File]::WriteAllText((Join-Path $RunDirectory $Name),($Value|ConvertTo-Json -Depth 8),$utf8)}
$child=$null
try {
  $config=Get-Content -LiteralPath (Join-Path $RunDirectory 'run-config.json') -Raw -Encoding utf8 | ConvertFrom-Json
  if([int]$config.cpuCapPercent -ne $verifiedCap){throw 'Configured CPU cap does not match verified job cap'}
  $node=(Get-Command node.exe).Source
  $child=Start-Process -FilePath $node -ArgumentList @($Controller) -WorkingDirectory $Workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RunDirectory 'stdout.log') -RedirectStandardError (Join-Path $RunDirectory 'stderr.log')
  if(-not [AcceptanceCpuJob]::Contains($job,$child.Id)){throw 'Controller did not inherit recording job'}
  WriteJson 'process.json' @{wrapperPid=$PID;controllerPid=$child.Id;workspace=$Workspace;startedAt=(Get-Date).ToString('o');jobName=$jobName;hardCpuCapPercent=$verifiedCap;priority='BelowNormal';descendantsInheritJob=$true;workers=$config.workers;casesPerBatch=$config.casesPerBatch;cooldownSeconds=$config.cooldownSeconds;systemCpuThreshold=$config.systemCpuThreshold}
  $previousSystem=[AcceptanceCpuJob]::SystemTimes();$previousAccounting=[AcceptanceCpuJob]::ReadAccounting($job);$previousAt=[DateTime]::UtcNow
  do {
    $exited=$child.WaitForExit(5000)
    $now=[DateTime]::UtcNow;$system=[AcceptanceCpuJob]::SystemTimes();$accounting=[AcceptanceCpuJob]::ReadAccounting($job)
    $total=[double]($system[1]-$previousSystem[1]);$idle=[double]($system[0]-$previousSystem[0]);$elapsed=($now-$previousAt).TotalSeconds
    $systemPercent=if($total -gt 0){[Math]::Round(100*(1-$idle/$total),1)}else{0}
    $jobSeconds=($accounting.UserTime+$accounting.KernelTime-$previousAccounting.UserTime-$previousAccounting.KernelTime)/10000000.0
    $treePercent=if($elapsed -gt 0){[Math]::Round(100*$jobSeconds/$elapsed/[Environment]::ProcessorCount,1)}else{0}
    $row=@{at=$now.ToString('o');systemCpuPercent=$systemPercent;recordingTreeCpuPercent=$treePercent;hardCpuCapPercent=[AcceptanceCpuJob]::ReadCap($job);activeProcesses=$accounting.ActiveProcesses;controllerPid=$child.Id;controllerRunning=(-not $exited)}
    WriteJson 'cpu-current.json' $row
    [IO.File]::AppendAllText((Join-Path $RunDirectory 'cpu-history.jsonl'),(($row|ConvertTo-Json -Compress)+[Environment]::NewLine),$utf8)
    $previousSystem=$system;$previousAccounting=$accounting;$previousAt=$now
  } while(-not $exited)
  WriteJson 'wrapper-result.json' @{finishedAt=(Get-Date).ToString('o');controllerExitCode=$child.ExitCode;remainingProcesses=$accounting.ActiveProcesses}
} catch {
  WriteJson 'wrapper-error.json' @{at=(Get-Date).ToString('o');error=$_.Exception.ToString()}
} finally {
  # Only this named recording job is affected; no global chrome/node process killing.
  [AcceptanceCpuJob]::TerminateJobObject($job,0) | Out-Null
}