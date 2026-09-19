param(
    [int]$Port = 5000,
    [string]$BindAddress = 'localhost'
)

$port = $Port
$root = Get-Location
$contentTypes = @{
    '.css' = 'text/css; charset=utf-8'
    '.html' = 'text/html; charset=utf-8'
    '.ico' = 'image/x-icon'
    '.js' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg' = 'image/svg+xml'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://$BindAddress`:$port/")
$listener.Start()
if ($BindAddress -eq 'localhost') {
    Write-Output "Server running at http://localhost:$port"
} else {
    Write-Output "Server listening on http://$BindAddress`:$port"
    Write-Output "Students can open http://<HOST-COMPUTER-IP>:$port"
}
while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = $context.Request.Url.AbsolutePath
    if ($path -eq '/' -or $path -eq '/favicon.ico') { $path = '/index.html' }
    $localPath = Join-Path $root ($path.TrimStart('/'))
    if ($path -eq '/favicon.svg') { $localPath = Join-Path $root 'favicon.svg' }
    if (Test-Path $localPath -PathType Leaf) {
        $content = [System.IO.File]::ReadAllBytes($localPath)
        $context.Response.ContentLength64 = $content.Length
        $extension = [System.IO.Path]::GetExtension($localPath).ToLowerInvariant()
        if ($contentTypes.ContainsKey($extension)) {
            $context.Response.ContentType = $contentTypes[$extension]
        } else {
            $context.Response.ContentType = 'application/octet-stream'
        }
        $context.Response.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        $context.Response.Headers.Add('Pragma', 'no-cache')
        $context.Response.OutputStream.Write($content, 0, $content.Length)
        $context.Response.OutputStream.Close()
    } else {
        $context.Response.StatusCode = 404
        $context.Response.Close()
    }
}
