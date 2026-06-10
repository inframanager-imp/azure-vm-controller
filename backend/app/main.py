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

# Import and include routers
from app.routes.auth import router as auth_router
from app.routes.azure import router as azure_router
from app.routes.vms import router as vms_router
from app.routes.schedules import router as schedules_router
from app.routes.users import router as users_router
from app.routes.audit import router as audit_router

app.include_router(auth_router)
app.include_router(azure_router)
app.include_router(vms_router)
app.include_router(schedules_router)
app.include_router(users_router)
app.include_router(audit_router)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Gyan Azure VM Manager"}
