import logging
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import User
from app.auth import get_password_hash
from app.scheduler import scheduler, sync_scheduler_jobs
from app.azure_client import refresh_vm_cache

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("main")

# Seeding Logic
def seed_database():
    db = SessionLocal()
    try:
        # Check if any admin exists
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            logger.info(f"Seeding default admin user: {settings.ADMIN_EMAIL}")
            admin_user = User(
                username="admin",
                email=settings.ADMIN_EMAIL,
                password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                role="admin",
                is_active=True
            )
            db.add(admin_user)
            db.commit()
    except Exception as e:
        logger.error(f"Error seeding database: {str(e)}")
    finally:
        db.close()

def run_initial_azure_poll():
    """
    Runs an initial cache refresh. Executed in a background thread to prevent blocking server start.
    """
    logger.info("Starting initial Azure VM cache poll...")
    db = SessionLocal()
    try:
        refresh_vm_cache(db)
    except Exception as e:
        logger.error(f"Initial Azure VM cache poll failed: {str(e)}")
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    # Create DB tables
    Base.metadata.create_all(bind=engine)
    
    # Seed default admin
    seed_database()
    
    # Start APScheduler
    scheduler.start()
    
    # Add recurring cache refresh job every 20 seconds (Correction #5: Cache Poller Job)
    scheduler.add_job(
        func=run_initial_azure_poll,
        trigger="interval",
        seconds=20,
        id="cache_refresh_job",
        replace_existing=True
    )
    
    # Sync database schedules into APScheduler jobs
    db = SessionLocal()
    try:
        sync_scheduler_jobs(db)
    finally:
        db.close()
        
    # Trigger initial cache poll immediately in a background thread (Correction: Initial cache poll on startup)
    threading.Thread(target=run_initial_azure_poll, daemon=True).start()
    
    yield
    
    # --- Shutdown ---
    logger.info("Shutting down scheduler...")
    scheduler.shutdown()

app = FastAPI(
    title="Gyan Azure VM Manager",
    description="Manage Azure VMs and schedules with secure RBAC.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
# Allows requests from Vite dev server during local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers with /api prefix
from app.routes.auth import router as auth_router
from app.routes.azure import router as azure_router
from app.routes.vms import router as vms_router
from app.routes.schedules import router as schedules_router
from app.routes.users import router as users_router
from app.routes.audit import router as audit_router

app.include_router(auth_router, prefix="/api")
app.include_router(azure_router, prefix="/api")
app.include_router(vms_router, prefix="/api")
app.include_router(schedules_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(audit_router, prefix="/api")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Gyan Azure VM Manager"}

# Serve static assets compiled by Vite
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

static_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "static"))
assets_dir = os.path.join(static_dir, "assets")

if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# Single Page Application (SPA) catch-all route for frontend views
@app.get("/{catchall:path}")
def serve_spa(catchall: str):
    # If request starts with api/, return standard API 404
    if catchall.startswith("api/") or catchall.startswith("api"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="API endpoint not found")
        
    # Check if a static file exists in the static directory (e.g. logo.png)
    file_path = os.path.join(static_dir, catchall)
    if catchall and os.path.isfile(file_path):
        return FileResponse(file_path)
        
    # Default fallback to React SPA's index.html
    index_path = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
        
    # If frontend has not been compiled, return placeholder text
    from fastapi.responses import HTMLResponse
    return HTMLResponse("<html><body><h1>Gyan Azure VM Manager</h1><p>API is running, but frontend is not yet compiled.</p></body></html>")
