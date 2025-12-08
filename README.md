# Service Platform - P2P Services with Escrow

Plataforma de servicios P2P con custodia blockchain usando Next.js 14, PostgreSQL, Prisma, Foundry y Ethers.js v6.

## 🚀 Características

- **Sistema Dual de Usuarios**: Los usuarios pueden actuar como Cliente y Proveedor simultáneamente
- **Sistema de Ranking Dual**: Calificaciones separadas para rol de Cliente y Proveedor
- **Smart Contract de Escrow**: Custodia de fondos en blockchain
- **Reviews**: Sistema de reseñas con validación de trabajos completados
- **Especialidades**: Los proveedores pueden configurar sus especialidades

## 📋 Requisitos Previos

- Node.js 18+ y npm
- Docker y Docker Compose
- Foundry (para Smart Contracts)

## 🛠️ Instalación

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env` y configura:

```env
DATABASE_URL="postgresql://serviceplatform:serviceplatform123@localhost:5432/serviceplatform?schema=public"
NEXT_PUBLIC_RPC_URL="http://127.0.0.1:8545"
NEXT_PUBLIC_CHAIN_ID="31337"
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=""
JWT_SECRET="your-secret-key-change-in-production"
ENCRYPTION_KEY="your-encryption-key-32-chars!!"
```

### 3. Iniciar PostgreSQL con Docker

```bash
docker-compose up -d
```

### 4. Configurar base de datos

```bash
# Generar cliente Prisma
npm run db:generate

# Crear esquema en la base de datos
npm run db:push

# Opcional: crear migración
npm run db:migrate
```

### 5. Instalar Foundry (si no está instalado)

**Windows (PowerShell):**
```powershell
# Descargar e instalar Foundry desde https://github.com/foundry-rs/foundry/releases
# O usar chocolatey: choco install foundry
```

**Linux/Mac:**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 5.1. Instalar Dependencias de Foundry

```bash
forge install foundry-rs/forge-std
```

Esto instalará `forge-std` en `lib/forge-std/`.

### 6. Compilar Smart Contracts

```bash
forge build
```

### 7. Desplegar Smart Contract (en terminal separada)

Inicia Anvil:

**Recomendado (usa mnemonic fijo para direcciones consistentes):**
```bash
npm run anvil
```

**O manualmente:**
```bash
anvil --steps-tracing --mnemonic "test test test test test test test test test test test junk"
```

**⚠️ IMPORTANTE:** Siempre usa el mnemonic fijo para que Anvil genere las mismas direcciones cada vez. Esto es necesario para que el seed funcione correctamente.

**Nota:** Usa `--steps-tracing` para ver todas las transacciones internas, incluyendo las transferencias de ETH entre billeteras que se realizan dentro del contrato.

En otra terminal, despliega el contrato:

```bash
# Usando --private-key (recomendado para Anvil)
forge script script/Deploy.s.sol:DeployScript --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

O usando el script helper en PowerShell:
```powershell
.\scripts\deploy-contract.ps1
```

Copia la dirección del contrato desplegado a `.env` como `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS`.

### 8. Poblar datos iniciales

```bash
npm run db:seed
```

## 🎯 Scripts Disponibles

- `npm run dev` - Inicia servidor de desarrollo Next.js
- `npm run build` - Construye aplicación para producción
- `npm run db:generate` - Genera cliente Prisma
- `npm run db:push` - Sincroniza schema con base de datos
- `npm run db:migrate` - Crea migración de base de datos
- `npm run db:seed` - Pobla base de datos con datos iniciales
- `npm run db:studio` - Abre Prisma Studio
- `forge build` - Compila Smart Contracts
- `forge test` - Ejecuta tests de Smart Contracts
- `anvil` - Inicia red blockchain local

## 📁 Estructura del Proyecto

```
serviceplatform/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── users/         # Endpoints de usuarios
│   │   ├── jobs/          # Endpoints de trabajos
│   │   └── reviews/       # Endpoints de reseñas
│   ├── layout.tsx         # Layout principal
│   └── page.tsx           # Página principal
├── components/            # Componentes React
│   ├── UserProfile.tsx    # Perfil de usuario
│   └── ReviewModal.tsx    # Modal de reseñas
├── contracts/             # Smart Contracts Solidity
│   └── EscrowService.sol  # Contrato principal
├── lib/                   # Utilidades
│   ├── prisma.ts          # Cliente Prisma
│   └── web3/              # Utilidades Web3
├── prisma/                # Prisma
│   ├── schema.prisma      # Schema de base de datos
│   └── seed.ts            # Script de seeding
├── script/                # Scripts de deployment
│   └── Deploy.s.sol       # Script de despliegue
└── docker-compose.yml     # Configuración Docker
```

## 🔐 Usuarios de Prueba

Después de ejecutar el seed:

- **Juan (Cliente)**: `juan@example.com` / `juan123`
- **Maria (Electricista)**: `maria@example.com` / `maria123`
- **Pedro (Todero)**: `pedro@example.com` / `pedro123`

## 🔄 Flujo de Trabajo

1. **Registro**: El usuario se registra y se genera una wallet automáticamente
2. **Configuración de Perfil**: El usuario puede añadir especialidades para aparecer como proveedor
3. **Publicación de Trabajo**: El cliente publica un trabajo eligiendo categoría
4. **Aceptación**: Un proveedor acepta el trabajo
5. **Confirmación**: Ambas partes confirman la finalización
6. **Reseñas**: Una vez completado en blockchain, ambas partes pueden dejar reseñas
7. **Calificaciones**: Los scores se recalculan automáticamente

## 🔧 Desarrollo

### Base de datos

```bash
# Ver datos en Prisma Studio
npm run db:studio
```

### Smart Contracts

```bash
# Compilar
forge build

# Test
forge test

# Desplegar en local
forge script script/Deploy.s.sol:DeployScript --rpc-url anvil --broadcast
```

## 📝 Notas

- El sistema maneja la reputación off-chain (PostgreSQL) pero valida que los trabajos existan y estén completados en la blockchain
- Las wallets se generan automáticamente al crear cuenta
- Las claves privadas se encriptan antes de almacenarse
- El sistema soporta múltiples especialidades por proveedor

## 🚧 MVP Features

- ✅ Registro de usuarios con generación automática de wallet
- ✅ Sistema dual de roles (Cliente/Proveedor)
- ✅ Sistema de ranking dual
- ✅ Smart Contract de Escrow
- ✅ Gestión de trabajos
- ✅ Sistema de reviews con validación
- ✅ Frontend básico con componentes principales

## 📄 Licencia

MIT

