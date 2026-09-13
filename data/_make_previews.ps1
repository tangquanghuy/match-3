Add-Type -AssemblyName System.Drawing
$manifest = Get-Content -LiteralPath 'data\_0335_0500_manifest.json' -Raw -Encoding utf8 | ConvertFrom-Json
$out = Join-Path (Get-Location) 'data\_label_previews_0335_0500'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Get-ChildItem -LiteralPath $out -Filter '*.jpg' -ErrorAction SilentlyContinue | Remove-Item -Force
$font = New-Object System.Drawing.Font('Arial', 20, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font('Arial', 12)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
for($start = 0; $start -lt $manifest.Count; $start += 12) {
  $end = [Math]::Min($start + 11, $manifest.Count - 1)
  $group = @($manifest[$start..$end])
  [int]$cellW = 520; [int]$cellH = 500; [int]$cols = 4; [int]$rows = 3
  [int]$fullW = $cellW * $cols; [int]$fullH = $cellH * $rows
  $sheet = New-Object System.Drawing.Bitmap -ArgumentList @($fullW, $fullH, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($sheet)
  $g.Clear([System.Drawing.Color]::FromArgb(31,35,44))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  for($i = 0; $i -lt $group.Count; $i++) {
    $rec = $group[$i]
    [int]$x = ($i % $cols) * $cellW
    [int]$y = [Math]::Floor($i / $cols) * $cellH
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90,100,115),2)
    $g.DrawRectangle($pen,$x+2,$y+2,$cellW-5,$cellH-5); $pen.Dispose()
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(13,16,23))
    $g.FillRectangle($brush,$x+3,$y+3,$cellW-5,42); $brush.Dispose()
    $names = New-Object System.Collections.Generic.List[string]
    foreach($p in @($rec.images -split '\|')) {
      if($p) {
        $names.Add([IO.Path]::GetFileName($p))
        try {
          $im = [System.Drawing.Image]::FromFile($p)
          [int]$maxW = $cellW - 20; [int]$maxH = $cellH - 70
          $r = [Math]::Min($maxW / $im.Width, $maxH / $im.Height)
          [int]$w = $im.Width * $r; [int]$h = $im.Height * $r
          [int]$px = $x+10 + [Math]::Floor(($maxW-$w)/2); [int]$py = $y+50 + [Math]::Floor(($maxH-$h)/2)
          $g.DrawImage($im,$px,$py,$w,$h)
          $im.Dispose()
        } catch { $g.DrawString($_.Exception.Message,$fontSmall,[System.Drawing.Brushes]::Red,$x+10,$y+60) }
      }
    }
    $title = "$($rec.id)   $($names -join ' + ')"
    $rect = [System.Drawing.RectangleF]::new([single]($x+8),[single]($y+4),[single]($cellW-16),[single]36)
    $g.DrawString($title,$font,[System.Drawing.Brushes]::White,$rect,$fmt)
  }
  [int]$pageNumber = [int]($start / 12 + 1); $num = $pageNumber.ToString('D2')
  $filename = "page_$num.jpg"
  $sheet.Save((Join-Path $out $filename),[System.Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose(); $sheet.Dispose()
}
$font.Dispose(); $fontSmall.Dispose(); $fmt.Dispose()
Get-ChildItem -LiteralPath $out -Filter '*.jpg' | Select-Object Name,Length




