# Tiny HTTP static server for local + Quest 3 testing.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\serve.ps1
# Open http://localhost:8000/ on this PC.
# For the Quest 3, WebXR needs HTTPS (localhost excepted), so use ngrok:
#   ngrok http 8000
# Then open the https://...ngrok-free.app URL in the Quest 3 browser.

$port = 8000
$root = (Resolve-Path ".").Path

$listener = New-Object System.Net.HttpListener
# Bind to localhost only (no admin required). Use ngrok/cloudflared to expose to Quest 3.
$listener.Prefixes.Add("http://localhost:$port/")

try {
  $listener.Start()
} catch {
  Write-Host "Failed to bind on port $port." -ForegroundColor Yellow
  Write-Host "Port may already be in use. Stop the other process or change \$port." -ForegroundColor Yellow
  throw
}

Write-Host "Serving $root"
Write-Host ("  Local: http://localhost:{0}/" -f $port)
Write-Host "  For Quest 3 AR: run 'ngrok http $port' in another terminal,"
Write-Host "                  then open the https://...ngrok-free.app URL in the Quest browser."

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.wasm' = 'application/wasm'
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch {
    break
  }
  $req = $ctx.Request
  $res = $ctx.Response
  $path = [uri]::UnescapeDataString($req.Url.AbsolutePath)
  if ($path -eq '/') { $path = '/index.html' }
  $file = Join-Path $root ($path.TrimStart('/'))
  try {
    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $type = $mime[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentType = $type
      $res.Headers.Add('Cache-Control','no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("Not found: " + $path)
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
