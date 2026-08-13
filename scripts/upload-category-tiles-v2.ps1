# Upload v2 category tiles and patch categories.image + store-data
$ErrorActionPreference = "Stop"
$secrets = Get-Content "$env:TEMP\sanam-supabase-secrets.json" -Raw | ConvertFrom-Json
$url = $secrets.url.TrimEnd("/")
$key = $secrets.service_role
$manifest = Get-Content (Join-Path $PSScriptRoot "category-tile-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$tileDir = Join-Path $PSScriptRoot "generated-category-tiles-v2"
$publicBase = "$url/storage/v1/object/public/images/categories/banners"
$v = Get-Date -Format yyyyMMddHHmm
$updated = 0
$missing = 0
$i = 0

foreach ($item in $manifest) {
  $i++
  $slug = $item.slug
  $id = $item.id
  $file = Join-Path $tileDir "$slug.webp"
  if (-not (Test-Path $file)) {
    Write-Host "MISSING $slug"
    $missing++
    continue
  }
  $bytes = [System.IO.File]::ReadAllBytes($file)
  $uploadHeaders = @{
    apikey = $key
    Authorization = "Bearer $key"
    "Content-Type" = "image/webp"
    "x-upsert" = "true"
    "User-Agent" = "Mozilla/5.0"
  }
  $storageUri = "$url/storage/v1/object/images/categories/banners/$slug.webp"
  try {
    Invoke-RestMethod -Method Post -Uri $storageUri -Headers $uploadHeaders -Body $bytes | Out-Null
  } catch {
    Invoke-RestMethod -Method Put -Uri $storageUri -Headers $uploadHeaders -Body $bytes | Out-Null
  }
  $imageUrl = "$publicBase/$slug.webp?v=$v"
  $patchHeaders = @{
    apikey = $key
    Authorization = "Bearer $key"
    "Content-Type" = "application/json"
    Prefer = "return=minimal"
    "User-Agent" = "Mozilla/5.0"
  }
  $body = (@{ image = $imageUrl } | ConvertTo-Json -Compress)
  Invoke-RestMethod -Method Patch -Uri "$url/rest/v1/categories?id=eq.$id" -Headers $patchHeaders -Body $body | Out-Null
  $updated++
  if ($i % 15 -eq 0) { Write-Host "uploaded $i/$($manifest.Count)" }
}

Write-Host "DONE updated=$updated missing=$missing v=$v"

# Patch store-data.ts
$tsPath = Join-Path (Split-Path $PSScriptRoot -Parent) "src\data\store-data.ts"
$ts = Get-Content $tsPath -Raw -Encoding UTF8
$count = 0
foreach ($item in $manifest) {
  $slug = $item.slug
  $newUrl = "$publicBase/$slug.webp?v=$v"
  $pattern = "(\{ id: `"$([regex]::Escape($slug))`",[^\}]*?image: `")[^`"]+(`")"
  $newTs = [regex]::Replace($ts, $pattern, "`${1}$newUrl`${2}")
  if ($newTs -ne $ts) { $count++; $ts = $newTs }
}
[System.IO.File]::WriteAllText((Resolve-Path $tsPath), $ts, [System.Text.UTF8Encoding]::new($false))
Write-Host "store-data patched=$count"
