# Script para desplegar el contrato EscrowService en Anvil
# Asegurate de que Anvil este corriendo antes de ejecutar este script

Write-Host "Desplegando contrato EscrowService..." -ForegroundColor Cyan

# Verificar que Anvil este corriendo
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 2
    Write-Host "Anvil esta corriendo" -ForegroundColor Green
} catch {
    Write-Host "Error: Anvil no esta corriendo. Inicia Anvil primero con: anvil" -ForegroundColor Red
    exit 1
}

# Anadir Foundry al PATH si no esta
$foundryPath = "$env:USERPROFILE\.foundry\bin"
if ($env:PATH -notlike "*$foundryPath*") {
    $env:PATH += ";$foundryPath"
}

# Cuenta de Anvil por defecto (Account #0)
$senderAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
$privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

Write-Host "Usando cuenta: $senderAddress" -ForegroundColor Yellow
Write-Host ""

# Desplegar usando --private-key (mas confiable con Anvil)
Write-Host "Ejecutando forge script..." -ForegroundColor Cyan
$deployResult = forge script script/Deploy.s.sol:DeployScript --rpc-url http://127.0.0.1:8545 --broadcast --private-key $privateKey 2>&1
$deploySuccess = $LASTEXITCODE -eq 0

if ($deploySuccess) {
    Write-Host ""
    Write-Host "Contrato desplegado exitosamente!" -ForegroundColor Green
    Write-Host ""
    
    # Esperar un momento para que se escriba el archivo
    Start-Sleep -Seconds 2
    
    # Intentar obtener la direccion automaticamente
    Write-Host "Obteniendo direccion del contrato..." -ForegroundColor Cyan
    $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
    & "$scriptPath\get-contract-address.ps1"
    
    Write-Host ""
    Write-Host "Proximos pasos:" -ForegroundColor Cyan
    Write-Host "1. Verifica que NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS este en tu .env" -ForegroundColor White
    Write-Host "2. Ejecuta: npm run db:push (para actualizar el schema con contractJobId)" -ForegroundColor White
    Write-Host "3. Ejecuta: npm run db:seed (para crear usuarios con las cuentas de Anvil)" -ForegroundColor White
    Write-Host ""
    Write-Host "Account #0 de Anvil se usa para el contrato" -ForegroundColor Yellow
    Write-Host "Accounts #1, #2, #3 se usan para los usuarios del seed" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Error al desplegar el contrato. Verifica:" -ForegroundColor Red
    Write-Host "  - Que Anvil este corriendo en http://127.0.0.1:8545" -ForegroundColor Yellow
    Write-Host "  - Que tengas suficientes fondos (Anvil pre-funda las cuentas automaticamente)" -ForegroundColor Yellow
}
