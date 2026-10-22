Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot "..\public\icons"
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

foreach ($size in @(180, 192, 512)) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#f7f7f4"))

  $margin = [int]($size * 0.08)
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#292824"), [single]($size * 0.018))
  $graphics.DrawEllipse($pen, $margin, $margin, $size - (2 * $margin), $size - (2 * $margin))

  $font = New-Object System.Drawing.Font("Georgia", [single]($size * 0.52), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#292824"))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString("C", $font, $brush, [System.Drawing.RectangleF]::new(0, [single](-$size * 0.025), $size, $size), $format)

  $filename = if ($size -eq 180) { "apple-touch-icon.png" } else { "icon-$size.png" }
  $bitmap.Save((Join-Path $outputDirectory $filename), [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose(); $brush.Dispose(); $font.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
