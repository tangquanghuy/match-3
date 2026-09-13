<#
  build_fx_strip.ps1 - Pack a per-frame PNG sequence into a horizontal strip for the game FX pipeline.

  Usage:
    powershell -File scripts/build_fx_strip.ps1 -SrcRoot "<root>" -Id 0002 -Name water_bolt -FrameH 240 -MaxFrames 21
    powershell -File scripts/build_fx_strip.ps1 -SrcRoot "<root>" -Id 0002 -Name splash_chain_sword -StartFrame 0 -EndFrame 1 -FrameH 360 -MaxFrames 2

  Behavior:
    - Reads <SrcRoot>\<Id>\<Id>_*.png frames in order
    - Optionally restricts source frames with StartFrame / EndFrame (inclusive)
    - If selected frame count > MaxFrames, uniformly subsamples down to MaxFrames
    - Computes the union non-transparent bounding box across sampled frames (uniform crop -> aligned, trims empty space)
    - Scales each frame to height FrameH, concatenates into one horizontal strip
    - Writes src/assets/fx/<Name>_strip.png and prints META (frames / frameW / frameH / stripW)
#>
param(
  [Parameter(Mandatory=$true)][string]$SrcRoot,
  [Parameter(Mandatory=$true)][string]$Id,
  [Parameter(Mandatory=$true)][string]$Name,
  [int]$FrameH = 256,
  [int]$MaxFrames = 30,
  [int]$StartFrame = 0,
  [int]$EndFrame = -1,
  [string]$OutDir = "src\assets\fx"
)

Add-Type -AssemblyName System.Drawing

$srcDir = Join-Path $SrcRoot $Id
if (-not (Test-Path -LiteralPath $srcDir)) { throw "Source dir not found: $srcDir" }

$allFiles = @(Get-ChildItem -LiteralPath $srcDir -Filter *.png | Sort-Object Name)
if ($allFiles.Count -eq 0) { throw "No frames in: $srcDir" }
$lastFrame = if ($EndFrame -lt 0) { $allFiles.Count - 1 } else { [math]::Min($EndFrame, $allFiles.Count - 1) }
$firstFrame = [math]::Max(0, $StartFrame)
if ($firstFrame -gt $lastFrame) { throw "Invalid frame range: $firstFrame..$lastFrame" }
$files = @($allFiles[$firstFrame..$lastFrame])

function Load-Bmp([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  return [System.Drawing.Bitmap]::FromStream($ms)
}

# Uniform subsample down to MaxFrames
$indices = @(0..($files.Count - 1))
if ($files.Count -gt $MaxFrames) {
  $indices = @(0..($MaxFrames - 1) | ForEach-Object { [int][math]::Round($_ * ($files.Count - 1) / ($MaxFrames - 1)) })
  $indices = $indices | Select-Object -Unique
}
$sample = $indices | ForEach-Object { $files[$_] }
Write-Host ("Sampled frames: {0} / {1} (source range {2}..{3} of {4})" -f $sample.Count, $files.Count, $firstFrame, $lastFrame, $allFiles.Count)

$bmps = @()
foreach ($fl in $sample) { $bmps += (Load-Bmp $fl.FullName) }
$W = $bmps[0].Width; $H = $bmps[0].Height

# Union non-transparent bounding box (alpha > threshold)
$minX = $W; $minY = $H; $maxX = 0; $maxY = 0
$alphaThresh = 12
foreach ($bm in $bmps) {
  $rect = New-Object System.Drawing.Rectangle 0,0,$bm.Width,$bm.Height
  $data = $bm.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytesArr = New-Object byte[] ($stride * $bm.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytesArr, 0, $bytesArr.Length)
  $bm.UnlockBits($data)
  $step = 2
  for ($y = 0; $y -lt $bm.Height; $y += $step) {
    $row = $y * $stride
    for ($x = 0; $x -lt $bm.Width; $x += $step) {
      $a = $bytesArr[$row + $x*4 + 3]
      if ($a -gt $alphaThresh) {
        if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
}
if ($maxX -le $minX -or $maxY -le $minY) { $minX=0; $minY=0; $maxX=$W-1; $maxY=$H-1 }
$pad = 4
$minX = [math]::Max(0, $minX - $pad); $minY = [math]::Max(0, $minY - $pad)
$maxX = [math]::Min($W-1, $maxX + $pad); $maxY = [math]::Min($H-1, $maxY + $pad)
$cropW = $maxX - $minX + 1; $cropH = $maxY - $minY + 1
Write-Host ("Crop box: x=$minX y=$minY w=$cropW h=$cropH (orig ${W}x${H})")

$frameH = $FrameH
$frameW = [int][math]::Round($cropW * $frameH / $cropH)
$frames = $bmps.Count
$stripW = $frameW * $frames

$strip = New-Object System.Drawing.Bitmap($stripW, $frameH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($strip)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

$cropRect = New-Object System.Drawing.Rectangle $minX,$minY,$cropW,$cropH
for ($i = 0; $i -lt $frames; $i++) {
  $dst = New-Object System.Drawing.Rectangle ($i*$frameW),0,$frameW,$frameH
  $g.DrawImage($bmps[$i], $dst, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
}
$g.Dispose()

if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$outPath = Join-Path $OutDir ("{0}_strip.png" -f $Name)
$strip.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$strip.Dispose()
foreach ($bm in $bmps) { $bm.Dispose() }

Write-Host ""
Write-Host "=== DONE ==="
Write-Host ("Output: {0}" -f $outPath)
Write-Host ("META  frames={0}  frameW={1}  frameH={2}  stripW={3}" -f $frames, $frameW, $frameH, $stripW)
