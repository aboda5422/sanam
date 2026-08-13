# Upload generated category tiles to Supabase Storage and patch categories.image
$ErrorActionPreference = "Stop"
$secrets = Get-Content "$env:TEMP\sanam-supabase-secrets.json" -Raw | ConvertFrom-Json
$url = $secrets.url.TrimEnd("/")
$key = $secrets.service_role
$h = @{
  apikey = $key
  Authorization = "Bearer $key"
  Accept = "application/json"
  "User-Agent" = "Mozilla/5.0"
}
$manifest = Get-Content (Join-Path $PSScriptRoot "category-tile-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$tileDir = Join-Path $PSScriptRoot "generated-category-tiles"
$publicBase = "$url/storage/v1/object/public/images/categories/banners"
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
    # Some projects require PUT for upsert
    Invoke-RestMethod -Method Put -Uri $storageUri -Headers $uploadHeaders -Body $bytes | Out-Null
  }
  $imageUrl = "$publicBase/$slug.webp?v=$(Get-Date -Format yyyyMMddHHmm)"
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

Write-Host "DONE updated=$updated missing=$missing"
