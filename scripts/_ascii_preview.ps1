param(
  [string]$Path = 'D:\Code\match-3\game-assets/bundled/fx\splash_chain_cast_strip.png',
  [int]$FrameW = 309,
  [int]$FrameH = 240,
  [int[]]$Frames = @(8, 16, 24)
)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::FromFile($Path)
foreach ($f in $Frames) {
  Write-Output ("--- frame $f ---")
  $cols = 62; $rows = 24
  $cw = [math]::Floor($FrameW / $cols); $ch = [math]::Floor($FrameH / $rows)
  for ($r = 0; $r -lt $rows; $r++) {
    $line = ''
    for ($c = 0; $c -lt $cols; $c++) {
      $sum = 0.0; $n = 0
      for ($y = 0; $y -lt $ch; $y += 3) {
        for ($x = 0; $x -lt $cw; $x += 3) {
          $px = $src.GetPixel($f * $FrameW + $c * $cw + $x, $r * $ch + $y)
          $sum += ($px.R + $px.G + $px.B) * $px.A / 255.0
          $n++
        }
      }
      $v = $sum / $n / 3.0
      if ($v -gt 160) { $line += '#' }
      elseif ($v -gt 90) { $line += '+' }
      elseif ($v -gt 40) { $line += '.' }
      elseif ($v -gt 12) { $line += ',' }
      else { $line += ' ' }
    }
    Write-Output $line
  }
}
$src.Dispose()
