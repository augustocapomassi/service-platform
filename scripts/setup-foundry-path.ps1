# Script para añadir Foundry al PATH (sesión actual)
# Ejecuta este script al inicio de cada sesión de PowerShell, o añádelo a tu perfil

$foundryPath = "$env:USERPROFILE\.foundry\bin"

if (Test-Path $foundryPath) {
    if ($env:PATH -notlike "*$foundryPath*") {
        $env:PATH += ";$foundryPath"
        Write-Host "✅ Foundry añadido al PATH" -ForegroundColor Green
        Write-Host "   Forge versión: $(forge --version | Select-String -Pattern 'Version' | ForEach-Object { $_.Line.Split(':')[1].Trim() })" -ForegroundColor Cyan
    } else {
        Write-Host "✅ Foundry ya está en el PATH" -ForegroundColor Green
    }
} else {
    Write-Host "❌ No se encontró Foundry en $foundryPath" -ForegroundColor Red
    Write-Host "   Instala Foundry primero ejecutando: irm https://github.com/foundry-rs/foundry/releases/latest/download/foundryup-windows.exe | iex" -ForegroundColor Yellow
}

