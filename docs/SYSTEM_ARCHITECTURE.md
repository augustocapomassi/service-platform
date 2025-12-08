# Arquitectura del Sistema - Service Platform

## Diagrama General del Sistema

```mermaid
graph TB
    subgraph "Frontend - Next.js Client"
        UI[React Components]
        SocketClient[Socket.IO Client]
        UI --> SocketClient
    end
    
    subgraph "Backend - Next.js Server"
        API[API Routes]
        ServerJS[Custom Server.js]
        SocketServer[Socket.IO Server]
        ServerJS --> SocketServer
        ServerJS --> API
    end
    
    subgraph "Base de Datos"
        DB[(PostgreSQL)]
        Prisma[Prisma ORM]
        Prisma --> DB
    end
    
    subgraph "Blockchain"
        Anvil[Anvil Local Chain]
        Contract[EscrowService Contract]
        Anvil --> Contract
    end
    
    subgraph "Web3"
        Ethers[Ethers.js]
        Wallet[Wallet Manager]
        Escrow[Escrow Service]
        Ethers --> Anvil
        Wallet --> Ethers
        Escrow --> Ethers
        Escrow --> Wallet
    end
    
    UI -->|HTTP Requests| API
    API --> Prisma
    API --> Escrow
    SocketClient <-->|WebSocket| SocketServer
    SocketServer -->|Broadcast Events| SocketClient
    Escrow -->|Transactions| Contract
    
    style UI fill:#e1f5ff
    style API fill:#fff4e1
    style DB fill:#e8f5e9
    style Contract fill:#f3e5f5
    style SocketServer fill:#fff9c4
```

## Flujo de Creación de Trabajo

```mermaid
sequenceDiagram
    participant C as Cliente (Frontend)
    participant API as API Route /api/jobs
    participant DB as PostgreSQL
    participant WS as Socket.IO Server
    participant O as Otros Clientes
    
    C->>API: POST /api/jobs (crear trabajo)
    API->>DB: Prisma.job.create()
    DB-->>API: Job creado
    API->>WS: broadcast('new-job-created')
    WS->>O: Emit 'new-job-created'
    API-->>C: 201 Created (Job)
    O->>O: Actualizar lista de trabajos
```

## Flujo de Aceptación de Propuesta

```mermaid
sequenceDiagram
    participant C as Cliente
    participant API as API /api/proposals/[id]
    participant DB as PostgreSQL
    participant Escrow as Escrow Service
    participant BC as Blockchain (Anvil)
    participant WS as Socket.IO
    participant P as Proveedor
    
    C->>API: POST /api/proposals/[id] (accept)
    API->>DB: Obtener propuesta y trabajo
    API->>Escrow: createJobInContract()
    Escrow->>BC: createJob() con value (ETH)
    BC-->>Escrow: JobCreated event
    Escrow->>Escrow: Verificar fondos depositados
    Escrow-->>API: contractJobId, txHash
    API->>Escrow: acceptJobInContract()
    Escrow->>BC: acceptJob() (cambia a IN_PROGRESS)
    BC-->>Escrow: JobStatusUpdated event
    Escrow-->>API: txHash
    API->>DB: Actualizar job (status=IN_PROGRESS, contractJobId)
    API->>WS: broadcast('job-status-changed')
    WS->>C: Emit 'job-status-changed'
    WS->>P: Emit 'job-status-changed'
    API-->>C: 200 OK
```

## Flujo de Completar Trabajo

```mermaid
sequenceDiagram
    participant U as Usuario (Cliente/Proveedor)
    participant API as API /api/jobs/[id]/complete
    participant DB as PostgreSQL
    participant Escrow as Escrow Service
    participant BC as Blockchain
    participant WS as Socket.IO
    
    U->>API: POST /api/jobs/[id]/complete
    API->>DB: Obtener job
    API->>Escrow: confirmCompletionInContract()
    Escrow->>BC: confirmCompletion(jobId)
    BC->>BC: Verificar confirmaciones
    alt Ambas partes confirmaron
        BC->>BC: status = COMPLETED
        BC->>BC: Transferir ETH a proveedor
        BC-->>Escrow: FundsReleased event
    end
    Escrow-->>API: txHash
    API->>DB: Actualizar job (status=COMPLETED)
    API->>WS: broadcast('job-status-changed')
    WS->>U: Emit 'job-status-changed'
    API-->>U: 200 OK
```

## Arquitectura de Componentes Detallada

```mermaid
graph LR
    subgraph "Frontend Layer"
        A[app/jobs/page.tsx<br/>Lista de trabajos]
        B[components/CreateJobModal]
        C[components/ProposalModal]
        D[components/NotificationToast]
        E[hooks/useNotifications]
        F[lib/socket-client.ts]
    end
    
    subgraph "API Layer"
        G[app/api/jobs/route.ts<br/>GET/POST jobs]
        H[app/api/proposals/route.ts<br/>POST proposals]
        I[app/api/proposals/[id]/route.ts<br/>Accept/Reject]
        J[app/api/jobs/[id]/complete/route.ts]
        K[app/api/jobs/[id]/route.ts<br/>DELETE job]
    end
    
    subgraph "Business Logic"
        L[lib/web3/escrow.ts<br/>Contract interactions]
        M[lib/web3/wallet.ts<br/>Wallet management]
        N[lib/web3/utils.ts<br/>Provider & ABI]
    end
    
    subgraph "Real-time Communication"
        O[server/socket.js<br/>Socket.IO Server]
        P[server/socket-wrapper.ts<br/>TypeScript wrapper]
        Q[server.js<br/>Custom Next.js server]
    end
    
    subgraph "Data Layer"
        R[lib/prisma.ts<br/>Prisma Client]
        S[(PostgreSQL<br/>Database)]
    end
    
    subgraph "Blockchain Layer"
        T[Anvil<br/>Local Blockchain]
        U[EscrowService.sol<br/>Smart Contract]
    end
    
    A --> G
    A --> I
    A --> J
    B --> G
    C --> H
    D --> E
    E --> F
    F <--> O
    
    G --> R
    G --> P
    H --> R
    I --> R
    I --> L
    J --> R
    J --> L
    K --> R
    K --> P
    
    L --> M
    L --> N
    M --> N
    N --> T
    
    P --> O
    Q --> O
    Q --> G
    
    R --> S
    L --> U
    U --> T
    
    style A fill:#e3f2fd
    style G fill:#fff3e0
    style L fill:#f3e5f5
    style O fill:#fff9c4
    style R fill:#e8f5e9
    style U fill:#fce4ec
```

## Flujo de Datos - Socket.IO

```mermaid
graph TB
    subgraph "Cliente 1"
        C1[React Component]
        SC1[Socket Client]
        C1 --> SC1
    end
    
    subgraph "Cliente 2"
        C2[React Component]
        SC2[Socket Client]
        C2 --> SC2
    end
    
    subgraph "Servidor"
        SS[Socket.IO Server]
        SW[Socket Wrapper]
        API[API Routes]
        SS --> SW
        API --> SW
    end
    
    SC1 <-->|WebSocket| SS
    SC2 <-->|WebSocket| SS
    
    API -->|broadcast| SW
    SW -->|io.emit| SS
    SS -->|Event| SC1
    SS -->|Event| SC2
    
    style SS fill:#fff9c4
    style SW fill:#fff3e0
```

## Estados del Trabajo

```mermaid
stateDiagram-v2
    [*] --> PENDING: Cliente crea trabajo
    
    PENDING --> IN_PROGRESS: Proveedor acepta propuesta<br/>(fondos van a escrow)
    
    IN_PROGRESS --> COMPLETED: Ambas partes confirman<br/>(fondos liberados)
    
    IN_PROGRESS --> DISPUTED: Alguna parte levanta disputa
    
    COMPLETED --> [*]
    DISPUTED --> [*]
    
    PENDING --> CANCELLED: Cliente cancela
    CANCELLED --> [*]
```

## Flujo de Fondos (Escrow)

```mermaid
sequenceDiagram
    participant C as Cliente Wallet
    participant API as API Route
    participant Contract as Escrow Contract
    participant P as Proveedor Wallet
    
    Note over C,P: 1. Cliente acepta propuesta
    C->>API: Aceptar propuesta
    API->>Contract: createJob(value: 900 ETH)
    Contract->>Contract: Almacenar 900 ETH en escrow
    Contract-->>API: JobCreated event
    
    Note over C,P: 2. Proveedor acepta trabajo
    API->>Contract: acceptJob()
    Contract->>Contract: status = IN_PROGRESS
    
    Note over C,P: 3. Trabajo completado
    API->>Contract: confirmCompletion() (cliente)
    API->>Contract: confirmCompletion() (proveedor)
    Contract->>Contract: status = COMPLETED
    Contract->>P: Transferir 900 ETH
    Contract-->>API: FundsReleased event
```

## Stack Tecnológico

```mermaid
graph TB
    subgraph "Frontend"
        NextJS[Next.js 14]
        React[React 18]
        Tailwind[Tailwind CSS]
        NextJS --> React
        NextJS --> Tailwind
    end
    
    subgraph "Backend"
        Node[Node.js]
        NextAPI[Next.js API Routes]
        Node --> NextAPI
    end
    
    subgraph "Database"
        Postgres[PostgreSQL]
        PrismaORM[Prisma ORM]
        PrismaORM --> Postgres
    end
    
    subgraph "Blockchain"
        Foundry[Foundry]
        Solidity[Solidity 0.8.20]
        EthersJS[Ethers.js v6]
        Foundry --> Solidity
        EthersJS --> Foundry
    end
    
    subgraph "Real-time"
        SocketIO[Socket.IO v4]
        SocketIO --> Node
    end
    
    subgraph "Dev Tools"
        Anvil[Anvil]
        TypeScript[TypeScript]
        Anvil --> Foundry
    end
    
    NextJS --> Node
    NextAPI --> PrismaORM
    NextAPI --> EthersJS
    NextAPI --> SocketIO
```

## Componentes Principales y Responsabilidades

### Frontend
- **app/jobs/page.tsx**: Página principal que muestra trabajos y maneja interacciones
- **components/CreateJobModal**: Modal para crear nuevos trabajos
- **components/ProposalModal**: Modal para enviar propuestas
- **components/NotificationToast**: Muestra notificaciones en tiempo real
- **hooks/useNotifications**: Hook para manejar notificaciones
- **lib/socket-client.ts**: Cliente Socket.IO singleton

### Backend API
- **app/api/jobs/route.ts**: CRUD de trabajos
- **app/api/proposals/route.ts**: Crear propuestas
- **app/api/proposals/[id]/route.ts**: Aceptar/rechazar propuestas
- **app/api/jobs/[id]/complete/route.ts**: Completar trabajos
- **app/api/jobs/[id]/route.ts**: Eliminar trabajos

### Web3 Layer
- **lib/web3/escrow.ts**: Interacciones con el contrato EscrowService
- **lib/web3/wallet.ts**: Gestión de billeteras y encriptación
- **lib/web3/utils.ts**: Provider y ABI del contrato

### Real-time
- **server/socket.js**: Servidor Socket.IO
- **server/socket-wrapper.ts**: Wrapper TypeScript para API routes
- **server.js**: Servidor Next.js personalizado

### Data
- **lib/prisma.ts**: Cliente Prisma
- **prisma/schema.prisma**: Schema de la base de datos

### Smart Contract
- **contracts/EscrowService.sol**: Contrato principal de escrow

