# EscrowService Smart Contract

## Compilación y Testing

```bash
# Instalar Foundry (si no está instalado)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Compilar
forge build

# Ejecutar tests
forge test

# Desplegar en Anvil (local)
forge script script/Deploy.s.sol:DeployScript --rpc-url anvil --broadcast
```

## Desplegar el Contrato

1. Iniciar Anvil: `anvil` o `forge script script/Deploy.s.sol:DeployScript --rpc-url anvil --broadcast`
2. Copiar la dirección del contrato desplegado a `.env` como `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS`


