$path = "c:\Users\Hamed\SITEMAN\messages\ar.json"
# Read text as UTF8 (this will ignore the BOM if present)
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
# Write back as UTF8 WITHOUT BOM
$utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBOM)
Write-Host "Removed BOM from ar.json"
