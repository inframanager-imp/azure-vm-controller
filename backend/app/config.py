import os
import sys
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Secrets
    JWT_SECRET: str
    FERNET_KEY: str
    
    # DB
    DATABASE_URL: str = "sqlite:///./db/gyan_azure.db"
    
    # JWT Auth settings
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # Seeding defaults
    ADMIN_EMAIL: str = "admin@gyan.ai"
    ADMIN_PASSWORD: str = "GyanAdminPassword123!"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Validate required variables on module load
try:
    from dotenv import load_dotenv
    load_dotenv()
    
    # We do a quick manual check before loading settings to raise very clear error messages
    jwt_sec = os.getenv("JWT_SECRET")
    fernet_key = os.getenv("FERNET_KEY")
    
    missing = []
    if not jwt_sec:
        missing.append("JWT_SECRET")
    if not fernet_key:
        missing.append("FERNET_KEY")
        
    if missing:
        print(f"CRITICAL ERROR: Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        print("Please configure them in your .env file or environment.", file=sys.stderr)
        sys.exit(1)
        
    # Check fernet key length
    import base64
    try:
        decoded = base64.urlsafe_b64decode(fernet_key.encode())
        if len(decoded) != 32:
            raise ValueError()
    except Exception:
        print("CRITICAL ERROR: FERNET_KEY must be a 32-byte URL-safe base64-encoded key.", file=sys.stderr)
        sys.exit(1)

    settings = Settings()
except Exception as e:
    print(f"CRITICAL ERROR initializing settings: {str(e)}", file=sys.stderr)
    sys.exit(1)
