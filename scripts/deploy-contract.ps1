# Script para desplegar el contrato EscrowService en Anvil
# Asegúrate de que Anvil esté corriendo antes de ejecutar este script

Write-Host "🚀 Desplegando contrato EscrowService..." -ForegroundColor Cyan

# Verificar que Anvil esté corriendo
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 2
    Write-Host "✅ Anvil está corriendo" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: Anvil no está corriendo. Inicia Anvil primero con: anvil" -ForegroundColor Red
    exit 1
}

# Añadir Foundry al PATH si no está
$foundryPath = "$env:USERPROFILE\.foundry\bin"
if ($env:PATH -notlike "*$foundryPath*") {
    $env:PATH += ";$foundryPath"
}

# Cuenta de Anvil por defecto (Account #0)
$senderAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
$privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

Write-Host "📝 Usando cuenta: $senderAddress" -ForegroundColor Yellow
Write-Host ""

# Desplegar usando --private-key (más confiable con Anvil)
Write-Host "Ejecutando forge script..." -ForegroundColor Cyan
forge script script/Deploy.s.sol:DeployScript `
    --rpc-url http://127.0.0.1:8545 `
    --broadcast `
    --private-key $privateKey

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Contrato desplegado exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Próximos pasos:" -ForegroundColor Cyan
    Write-Host "1. Copia la dirección del contrato desplegado (aparece en la salida)" -ForegroundColor White
    Write-Host "2. Añádela a tu archivo .env como NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 La dirección del contrato aparecerá después de 'EscrowService deployed at:'" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "❌ Error al desplegar el contrato. Verifica:" -ForegroundColor Red
    Write-Host "  - Que Anvil esté corriendo en http://127.0.0.1:8545" -ForegroundColor Yellow
    Write-Host "  - Que tengas suficientes fondos (Anvil pre-funda las cuentas automáticamente)" -ForegroundColor Yellow
}

