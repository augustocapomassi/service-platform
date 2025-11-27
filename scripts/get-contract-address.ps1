# Script para obtener la direccion del contrato desplegado y actualizar .env
# Este script lee la ultima ejecucion de deploy y extrae la direccion del contrato

Write-Host "Buscando direccion del contrato desplegado..." -ForegroundColor Cyan

# Buscar en los archivos de broadcast
$broadcastPath = "broadcast\Deploy.s.sol\31337"
$latestRunFile = "$broadcastPath\run-latest.json"

if (Test-Path $latestRunFile) {
    try {
        $runData = Get-Content $latestRunFile | ConvertFrom-Json
        
        # Buscar la transaccion de deployment - puede estar en transactions o en otra estructura
        $contractAddress = $null
        
        # Intentar diferentes estructuras de archivos de broadcast
        if ($runData.transactions) {
            $deploymentTx = $runData.transactions | Where-Object { 
                $_.contractName -eq "EscrowService" -or $_.contractAddress
            } | Select-Object -First 1
            
            if ($deploymentTx -and $deploymentTx.contractAddress) {
                $contractAddress = $deploymentTx.contractAddress
            }
        }
        
        # Si no se encontro, buscar en la salida del script
        if (-not $contractAddress) {
            # Buscar en todos los archivos de run
            $runFiles = Get-ChildItem -Path $broadcastPath -Filter "run-*.json" | Sort-Object LastWriteTime -Descending
            foreach ($file in $runFiles) {
                $fileData = Get-Content $file.FullName | ConvertTo-Json -Depth 10
                # Buscar cualquier referencia al contrato usando regex simple
                if ($fileData -match 'contractAddress["\s]*:["\s]*"(0x[a-fA-F0-9]{40})"') {
                    $contractAddress = $matches[1]
                    break
                }
            }
        }
        
        if ($contractAddress) {
            Write-Host "Contrato encontrado: $contractAddress" -ForegroundColor Green
            
            # Actualizar .env si existe
            $envFile = ".env"
            if (Test-Path $envFile) {
                $envLines = Get-Content $envFile
                $updated = $false
                $newLines = @()
                
                foreach ($line in $envLines) {
                    if ($line -match "^NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=(.+)") {
                        $newLines += "NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=$contractAddress"
                        $updated = $true
                    } else {
                        $newLines += $line
                    }
                }
                
                if (-not $updated) {
                    # Agregar si no existe
                    $newLines += "NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=$contractAddress"
                    Write-Host "Agregando NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS a .env..." -ForegroundColor Yellow
                } else {
                    Write-Host "Actualizando .env..." -ForegroundColor Yellow
                }
                
                Set-Content -Path $envFile -Value ($newLines -join "`n")
                Write-Host ".env actualizado con la direccion del contrato" -ForegroundColor Green
            } else {
                Write-Host "Archivo .env no encontrado. Agrega manualmente:" -ForegroundColor Yellow
                Write-Host "   NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=$contractAddress" -ForegroundColor White
            }
            
            Write-Host ""
            Write-Host "Direccion del contrato: $contractAddress" -ForegroundColor Cyan
            return $contractAddress
        } else {
            Write-Host "No se encontro la direccion del contrato en los archivos de broadcast" -ForegroundColor Red
            Write-Host "   Busca manualmente en la salida de forge script la linea:" -ForegroundColor Yellow
            Write-Host "   'EscrowService deployed at: 0x...'" -ForegroundColor White
        }
    } catch {
        Write-Host "Error al leer el archivo: $_" -ForegroundColor Red
    }
} else {
    Write-Host "No se encontro el archivo de deployment: $latestRunFile" -ForegroundColor Red
    Write-Host "   Asegurate de haber desplegado el contrato primero con:" -ForegroundColor Yellow
    Write-Host "   .\scripts\deploy-contract.ps1" -ForegroundColor White
}
