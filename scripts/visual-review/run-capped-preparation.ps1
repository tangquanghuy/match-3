param([string]$Workspace='D:\Code\match-3',[int]$CpuPercent=5,[switch]$All,[switch]$TailOnly,[string]$Keys='troop-6071,troop-6457,troop-6000,troop-6001,troop-6002,troop-6003,troop-6004,troop-6005,troop-6006,troop-6007,troop-6008,troop-6009')
$ErrorActionPreference='Stop'
$Workspace=(Resolve-Path -LiteralPath $Workspace).Path
Set-Location -LiteralPath $Workspace
$dir=Join-Path $Workspace 'artifacts/troop-audit/skill-visual-review-20260926'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
Add-Type -Path (Join-Path $Workspace 'scripts/windows/AcceptanceCpuJob.cs')
if($CpuPercent -lt 1 -or $CpuPercent -gt 10){throw 'Visual preparation cap must be 1..10 percent'}
$jobName='Local\Match3VisualPrep-'+$PID
$job=[AcceptanceCpuJob]::Create($jobName,$CpuPercent)
$env:VISUAL_PREP_CPU_CAP_PERCENT=[string][AcceptanceCpuJob]::ReadCap($job)
$env:PYTHONIOENCODING='utf-8'
Get-CimInstance Win32_Process -Filter "ParentProcessId=$PID AND Name='conhost.exe'" | ForEach-Object { [AcceptanceCpuJob]::Attach($job,[int]$_.ProcessId) }
$args=@('-u','scripts/visual-review/prepare_skill_storyboards.py','--workspace',$Workspace,'--keys',$Keys)
if($All){$args+=@('--all')}
if($TailOnly){$args+=@('--tail-only')}
$utf8=[Text.UTF8Encoding]::new($false)
try{
  $child=Start-Process (Get-Command python.exe).Source -ArgumentList $args -WorkingDirectory $Workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput "$dir/preparation-stdout.log" -RedirectStandardError "$dir/preparation-stderr.log"
  if(-not [AcceptanceCpuJob]::Contains($job,$child.Id)){throw 'Python did not inherit CPU cap'}
  [IO.File]::WriteAllText("$dir/preparation-process.json",(@{startedAt=(Get-Date).ToString('o');wrapperPid=$PID;childPid=$child.Id;jobName=$jobName;hardCpuCapPercent=[AcceptanceCpuJob]::ReadCap($job);workers=1;all=[bool]$All;note='Frame preparation only; no visual approval'}|ConvertTo-Json),$utf8)
  $child.WaitForExit()
  [IO.File]::WriteAllText("$dir/preparation-result.json",(@{finishedAt=(Get-Date).ToString('o');exitCode=$child.ExitCode}|ConvertTo-Json),$utf8)
} catch{
  [IO.File]::WriteAllText("$dir/preparation-error.json",(@{at=(Get-Date).ToString('o');error=$_.Exception.ToString()}|ConvertTo-Json),$utf8)
} finally{[AcceptanceCpuJob]::TerminateJobObject($job,0)|Out-Null}
