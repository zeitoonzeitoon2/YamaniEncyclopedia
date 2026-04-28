$path = "c:\Users\Hamed\SITEMAN\messages\ar.json"
$lines = Get-Content -Path $path -Encoding UTF8
for ($i=920; $i -le 935; $i++) {
    Write-Host "$($i+1): $($lines[$i])"
}
