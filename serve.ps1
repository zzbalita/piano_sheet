param(
  [int]$Port = 5173,
  [string]$Root = (Get-Location).Path
)

$Root = (Resolve-Path $Root).Path

function Get-ContentType([string]$Path) {
  switch -Regex ($Path.ToLowerInvariant()) {
    '\.html?$' { 'text/html; charset=utf-8'; break }
    '\.css$'   { 'text/css; charset=utf-8'; break }
    '\.js$'    { 'text/javascript; charset=utf-8'; break }
    '\.json$'  { 'application/json; charset=utf-8'; break }
    '\.svg$'   { 'image/svg+xml' ; break }
    '\.png$'   { 'image/png' ; break }
    '\.jpe?g$' { 'image/jpeg' ; break }
    '\.gif$'   { 'image/gif' ; break }
    '\.webp$'  { 'image/webp' ; break }
    '\.woff2$' { 'font/woff2' ; break }
    '\.woff$'  { 'font/woff' ; break }
    '\.ttf$'   { 'font/ttf' ; break }
    default    { 'application/octet-stream' }
  }
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Failed to start server on $prefix"
  Write-Host "Try a different port, e.g.: .\serve.ps1 -Port 8080"
  throw
}

Write-Host "Serving $Root at $prefix"
Write-Host "Open: $prefix`index.html"
Write-Host "Press Ctrl+C to stop"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    try {
      $rawPath = $req.Url.AbsolutePath
      $path = [System.Uri]::UnescapeDataString($rawPath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }

      $full = Join-Path $Root $path
      if (Test-Path $full -PathType Container) {
        $full = Join-Path $full 'index.html'
      }

      if (!(Test-Path $full -PathType Leaf)) {
        $res.StatusCode = 404
        $body = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $res.ContentType = 'text/plain; charset=utf-8'
        $res.OutputStream.Write($body, 0, $body.Length)
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.StatusCode = 200
      $res.ContentType = (Get-ContentType $full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $res.StatusCode = 500
      $body = [Text.Encoding]::UTF8.GetBytes("500 Server Error`n$($_.Exception.Message)")
      $res.ContentType = 'text/plain; charset=utf-8'
      $res.OutputStream.Write($body, 0, $body.Length)
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

