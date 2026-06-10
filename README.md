# Gyan Azure VM Manager

Gyan Azure VM Manager is a self-hosted web application that allows administrators and assigned users to manage Azure Virtual Machines (Start, Stop, Restart, Schedule) from a browser. It features robust, backend-enforced Role-Based Access Control (RBAC) scoped by individual VM or Resource Group.

---

## Features
- **VM Dashboard**: Real-time status display and power controls (Start, Stop (Deallocate), Restart).
- **Background Caching**: VM states are polled in the background (~20s) to keep lists fast and avoid Azure Resource Manager (ARM) API rate limits.
- **Automated Scheduling**: Cron-based scheduling (with timezone support) to auto-start/stop VMs.
- **Granular RBAC**: Assign users read/write permissions at the VM or Resource Group level.
- **Audit Logging**: Traceable record of all user-triggered and scheduler-triggered VM operations.

---

## 1. Setup Azure Service Principal

The application connects to Azure using a Service Principal (App Registration) with API access.

### Step 1: Create the Service Principal
Run the following command in the Azure CLI to create a Service Principal and assign it the **Virtual Machine Contributor** role on your subscription:

```bash
az ad sp create-for-rbac --name "GyanVMManager" \
                         --role "Virtual Machine Contributor" \
                         --scopes "/subscriptions/<YOUR_SUBSCRIPTION_ID>"
```

*Note: You can also scope the Service Principal to specific Resource Groups if you do not want to grant access to the entire subscription.*

### Step 2: Retrieve Credentials
The command will output JSON containing the required credentials. Note these down:
- **Tenant ID**: `tenant`
- **Client ID**: `appId`
- **Client Secret**: `password`
- **Subscription ID**: Your Azure Subscription ID

---

## 2. Running the Application

### Step 1: Clone and Configure Environment
Copy the `.env.example` template to `.env`:
```bash
cp .env.example .env
```

Generate the required cryptographic keys and insert them into the `.env` file:
1. **`JWT_SECRET`**: Generate a secure 32-byte hex key:
   ```bash
   openssl rand -hex 32
   ```
2. **`FERNET_KEY`**: Generate a base64 encryption key:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
3. Set your desired administrator credentials (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

### Step 2: Build and Run with Docker Compose
Run the following command to compile the frontend and start both containers:
```bash
docker compose up --build -d
```

Once launched:
- The web portal will be accessible at: **`http://localhost:2343`**
- The database is persisted using a Docker named volume `gyan_db_data`.

### Step 3: First Login
1. Navigate to `http://localhost:2343` and log in with your seeded administrator credentials (default: `admin` / `GyanAdminPassword123!`).
2. Go to the **Settings** page and input your Azure Service Principal details, then click **Test Connection** to verify permissions.
3. Save the configurations.
4. (Recommended) Go to **Users**, edit the admin account, and change the default password.

---

## 3. Production Deployment & Security Notice

> [!WARNING]
> **HTTP and TLS Proxy Requirements:**
> The Docker container serves the application over plain HTTP on port `2343`. 
> - If you expose this application beyond `localhost` (e.g., in a cloud VM or private intranet), you **MUST** deploy it behind a TLS/SSL reverse proxy (such as Nginx, Traefik, Caddy, or an Azure Application Gateway) to secure passwords, session tokens, and Azure credentials in transit.

---

## 4. Technical Architecture Details

1. **SQLite WAL Mode**: SQLite is configured with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) to allow concurrent database writes from the background scheduler and database reads from API threads.
2. **Single-Worker Server**: Uvicorn runs with `--workers 1` because APScheduler runs in-process. Pinning to a single worker prevents duplicate execution of schedules.
3. **VM Stop (Deallocate)**: The VM stop command calls Azure's `begin_deallocate` endpoint instead of `begin_power_off` to ensure computing resources are released and billing is paused.
4. **Synchronous Azure API Calls**: All FastAPI route handlers communicating with Azure are defined using standard `def` (not `async def`) to run them inside FastAPI's threadpool, preventing event-loop blocks.
5. **In-Memory Caching**: A background thread polls Azure VM states every 20 seconds. `/vms` requests serve data from this cache, preventing rate-limiting. Action triggers update the cache immediately so the UI reflects changes instantly.

---

## 5. Folder Structure Overview

```
azure-controller/
├── docker-compose.yml       # Orchestrates frontend & backend containers
├── .env.example             # Template for secure keys
├── README.md                # Deployment and setup documentation
├── backend/
│   ├── Dockerfile           # Python 3.11 environment setting workers=1
│   ├── requirements.txt     # Python SDK and FastAPI dependencies
│   └── app/
│       ├── config.py         # Validates environment secrets on startup
│       ├── database.py       # Manages connections & SQLite WAL pragmas
│       ├── models.py         # SQLAlchemy tables (User, Settings, Grants, Schedules, Logs)
│       ├── schemas.py        # Pydantic validation schemas
│       ├── auth.py           # JWT generation and role validation guards
│       ├── azure_client.py   # Azure SDK client and in-memory cache
│       ├── scheduler.py      # APScheduler job managers
│       └── routes/           # FastAPI endpoints
└── frontend/
    ├── Dockerfile           # Multi-stage production build (Node compile + Nginx serve)
    ├── nginx.conf           # Configures port 80 routing and API proxy passes
    ├── package.json         # React & Tailwind dependencies
    └── src/
        ├── App.jsx          # Route guards and Layout wrappers
        ├── assets/
        │   └── logo.png      # Gyan brand logo
        ├── components/      # Reusable UI elements (Sidebar, Modals, Toasts)
        ├── context/         # AuthContext state provider
        └── pages/           # Views (Dashboard, Schedules, Users, Settings)
```
