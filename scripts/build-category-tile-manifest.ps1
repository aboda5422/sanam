# Build category tile manifest via PowerShell (avoids Python Cloudflare blocks on Supabase API)
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

Write-Host "Fetching categories..."
$cats = Invoke-RestMethod -Uri "$url/rest/v1/categories?select=id,slug,name&is_active=eq.true&order=sort_order&limit=500" -Headers $h
$manifest = @()
$i = 0
foreach ($c in $cats) {
  $i++
  $imgs = @()
  try {
    $prods = Invoke-RestMethod -Uri "$url/rest/v1/products?select=image&category_id=eq.$($c.id)&is_active=eq.true&image=not.is.null&limit=4" -Headers $h
    foreach ($p in $prods) {
      if ($p.image -and $p.image -like "http*") { $imgs += $p.image }
    }
  } catch {}
  $manifest += [pscustomobject]@{
    id = $c.id
    slug = $c.slug
    name = $c.name
    images = @($imgs | Select-Object -First 4)
  }
  if ($i % 20 -eq 0) { Write-Host "  manifest $i/$($cats.Count)" }
}

$out = Join-Path $PSScriptRoot "category-tile-manifest.json"
($manifest | ConvertTo-Json -Depth 5) | Set-Content -Path $out -Encoding utf8
Write-Host "wrote $out items=$($manifest.Count)"
