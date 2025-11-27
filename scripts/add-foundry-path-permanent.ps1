# Script para añadir Foundry al PATH de forma permanente
# Ejecuta este script como Administrador para hacerlo permanente en todo el sistema

$foundryPath = "$env:USERPROFILE\.foundry\bin"

if (-not (Test-Path $foundryPath)) {
    Write-Host "❌ No se encontró Foundry en $foundryPath" -ForegroundColor Red
    Write-Host "   Instala Foundry primero." -ForegroundColor Yellow
    exit 1
}

# Obtener el PATH del sistema actual
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($currentPath -notlike "*$foundryPath*") {
    # Añadir Foundry al PATH del usuario
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$foundryPath", "User")
    
    # Añadir también al PATH de la sesión actual
    $env:PATH += ";$foundryPath"
    
    Write-Host "✅ Foundry añadido al PATH del sistema de forma permanente" -ForegroundColor Green
    Write-Host "   Nota: Puede ser necesario reiniciar la terminal para que los cambios surtan efecto" -ForegroundColor Yellow
    
    # Verificar
    forge --version | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Verificación exitosa: Foundry está funcionando" -ForegroundColor Green
    }
} else {
    Write-Host "✅ Foundry ya está en el PATH del sistema" -ForegroundColor Green
}

