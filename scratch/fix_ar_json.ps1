$path = "c:\Users\Hamed\SITEMAN\messages\ar.json"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
# Use regex to find "title": followed by anything and ending with a single quote
$pattern = '"title":\s*"([^"]*)'''
if ($content -match $pattern) {
    Write-Host "Found match: $($Matches[0])"
    $content = $content -replace $pattern, '"title": "$1",'
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Successfully fixed the broken title line using regex."
} else {
    Write-Host "Regex match not found. Checking for other syntax errors..."
    # Check if the file is just generally malformed JSON
    try {
        $test = $content | ConvertFrom-Json
        Write-Host "JSON is valid."
    } catch {
        Write-Host "JSON is still invalid: $($_.Exception.Message)"
        # If it's invalid, let's try to find where it's broken
        # The error log said line 3 roughly
        $lines = $content -split "`r?`n"
        for ($i=0; $i -lt 10; $i++) {
            Write-Host "Line $($i+1): $($lines[$i])"
        }
    }
}
