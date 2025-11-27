# Guía de Setup - Service Platform

## Pasos de Instalación

### 1. Instalar Dependencias de Node.js

```bash
npm install
```

### 2. Instalar Foundry

**Opción A: Usando foundryup (Recomendado)**

En PowerShell como Administrador:

```powershell
# Instalar foundryup
irm https://github.com/foundry-rs/foundry/releases/latest/download/foundryup-windows.exe -OutFile foundryup.exe
.\foundryup.exe

# O directamente ejecutar desde URL (método alternativo):
irm https://github.com/foundry-rs/foundry/releases/latest/download/foundryup-windows.exe | iex
```

**Opción B: Usando Chocolatey (si lo tienes instalado)**

```powershell
choco install foundry
```

**Opción C: Instalación Manual**

1. Descargar los binarios desde: https://github.com/foundry-rs/foundry/releases
2. Extraer `forge.exe`, `cast.exe`, `anvil.exe`, y `chisel.exe`
3. Añadir la carpeta al PATH del sistema

**Verificar instalación:**

```powershell
forge --version
anvil --version
```

**Nota importante sobre PATH en Windows:**

Si `forge` no se reconoce después de la instalación, Foundry está instalado pero no está en tu PATH. 

**Solución rápida (sesión actual):**
```powershell
$env:PATH += ";$env:USERPROFILE\.foundry\bin"
forge --version  # Debería funcionar ahora
```

**Solución permanente:**

Opción 1: Ejecutar el script helper (como Administrador):
```powershell
.\scripts\add-foundry-path-permanent.ps1
```

Opción 2: Añadir manualmente al PATH:
1. Busca "Variables de entorno" en Windows
2. Edita las variables de entorno del usuario
3. Añade `%USERPROFILE%\.foundry\bin` al PATH

### 3. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
DATABASE_URL="postgresql://serviceplatform:serviceplatform123@localhost:5432/serviceplatform?schema=public"
NEXT_PUBLIC_RPC_URL="http://127.0.0.1:8545"
NEXT_PUBLIC_CHAIN_ID="31337"
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=""
JWT_SECRET="your-secret-key-change-in-production"
ENCRYPTION_KEY="your-encryption-key-32-chars!!"
```

### 4. Iniciar PostgreSQL

```bash
docker-compose up -d
```

Verifica que esté corriendo:
```bash
docker ps
```

### 5. Configurar Base de Datos

```bash
# Generar cliente Prisma
npm run db:generate

# Crear esquema
npm run db:push
```

### 6. Instalar Dependencias de Foundry

```bash
forge install
```

Si esto falla, puedes instalar manualmente las dependencias necesarias o crear symlinks.

### 7. Compilar Smart Contracts

```bash
forge build
```

### 8. Desplegar Smart Contract

En una terminal, inicia Anvil (blockchain local):

```bash
anvil --steps-tracing
```

**Nota importante sobre logs de transferencias:** Si no ves las transferencias entre billeteras en los logs de Anvil, es porque las transferencias se realizan dentro del contrato (transacciones internas). Usa el flag `--steps-tracing` para ver todas las transacciones internas, incluyendo las transferencias de ETH entre direcciones.

En otra terminal, despliega el contrato:

**Opción 1: Usando el script helper (Recomendado):**
```powershell
.\scripts\deploy-contract.ps1
```

**Opción 2: Usando --private-key directamente:**
```bash
forge script script/Deploy.s.sol:DeployScript --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

**Nota:** La primera cuenta de Anvil (Account #0) tiene la dirección `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` y la clave privada `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`. Esta cuenta viene pre-fundada con ETH en Anvil.

**Importante:** Usa `--private-key` en lugar de `--sender` para evitar problemas con wallets desbloqueadas en Anvil.

Copia la dirección del contrato desplegado y añádela a `.env` como `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS`.

### 9. Poblar Base de Datos

```bash
npm run db:seed
```

### 10. Iniciar Servidor de Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Verificación

- ✅ PostgreSQL corriendo en puerto 5432
- ✅ Anvil corriendo en puerto 8545
- ✅ Contrato desplegado y dirección en `.env`
- ✅ Base de datos poblada con datos de prueba
- ✅ Aplicación corriendo en `http://localhost:3000`

## Usuarios de Prueba

Después del seed, puedes usar:

- **Juan (Cliente)**: `juan@example.com` / `juan123`
- **Maria (Electricista)**: `maria@example.com` / `maria123`
- **Pedro (Todero)**: `pedro@example.com` / `pedro123`

## Troubleshooting

### Error: Cannot find module 'forge-std'

Ejecuta `forge install` o instala las dependencias manualmente.

### Error: Connection refused (PostgreSQL)

Verifica que Docker esté corriendo y que el contenedor esté activo:
```bash
docker-compose ps
docker-compose logs postgres
```

### Error: Contract not deployed

Asegúrate de que Anvil esté corriendo antes de desplegar:
```bash
anvil --steps-tracing
```

### No veo las transferencias entre billeteras en los logs de Anvil

Las transferencias de ETH se realizan dentro del contrato usando transacciones internas (internal transactions). Anvil por defecto solo muestra las transacciones principales, no las internas.

**Solución:** Inicia Anvil con el flag `--steps-tracing`:
```bash
anvil --steps-tracing
```

O usando el script de npm:
```bash
npm run anvil
```

Esto mostrará todas las transacciones internas, incluyendo las transferencias de ETH entre direcciones cuando se completan trabajos, se resuelven disputas, o se cancelan trabajos.

### Error: Prisma Client not generated

Ejecuta:
```bash
npm run db:generate
```

### Error: 'forge' is not recognized

Foundry está instalado pero no está en tu PATH. Ejecuta:

```powershell
# Solución temporal (solo esta sesión)
$env:PATH += ";$env:USERPROFILE\.foundry\bin"

# Solución permanente
.\scripts\add-foundry-path-permanent.ps1
```

O añade manualmente `%USERPROFILE%\.foundry\bin` a las variables de entorno del sistema.

### Error: You seem to be using Foundry's default sender

Este error ocurre cuando no especificas explícitamente el sender para el despliegue. Usa:

```bash
forge script script/Deploy.s.sol:DeployScript --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Error: No associated wallet for addresses

Este error ocurre cuando intentas usar `--sender` pero la cuenta no está desbloqueada. Usa `--private-key` en su lugar:

```bash
forge script script/Deploy.s.sol:DeployScript --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

O usa el script helper:
```powershell
.\scripts\deploy-contract.ps1
```


