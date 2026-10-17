# Saves the NEW (Singapore) Neon connection string into .env as NEW_DATABASE_URL / NEW_DIRECT_URL.
# The current DATABASE_URL / DIRECT_URL are not touched. Nothing is printed except the host names.
$raw = Read-Host "Paste the NEW pooled connection string from Neon (host contains -pooler), then press Enter"
$raw = $raw.Trim().Trim('"').Trim("'")
if ($raw -notmatch '^postgres(ql)?://' -or $raw -notmatch '-pooler') { Write-Host "That doesn't look like a pooled Neon connection string. Nothing was saved."; exit 1 }
$u = $raw -replace '[&?]channel_binding=[^&]*', ''
$u = $u -replace 'sslmode=[^&]*', 'sslmode=verify-full'
if ($u -notmatch 'sslmode=') { $u += $(if ($u -match '\?') { '&' } else { '?' }) + 'sslmode=verify-full' }
$direct = $u -replace '-pooler', ''
$lines = Get-Content .env | Where-Object { $_ -notmatch '^(NEW_DATABASE_URL|NEW_DIRECT_URL)=' }
$lines += "NEW_DATABASE_URL=`"$u`""
$lines += "NEW_DIRECT_URL=`"$direct`""
Set-Content .env $lines
$h1 = ([uri]($u -replace '^postgresql', 'http' -replace '^postgres', 'http')).Host
$h2 = ([uri]($direct -replace '^postgresql', 'http' -replace '^postgres', 'http')).Host
Write-Host "Saved. Pooled host: $h1"
Write-Host "Saved. Direct host: $h2"
