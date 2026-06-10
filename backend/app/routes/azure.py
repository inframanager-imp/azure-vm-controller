from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_admin
from app.models import User, AzureSettings
from app.schemas import AzureSettingsCreate, AzureSettingsResponse
from app.azure_client import (
    encrypt_secret, decrypt_secret, get_resource_client, get_azure_credentials
)
from azure.identity import ClientSecretCredential
from azure.mgmt.resource import ResourceManagementClient

router = APIRouter(prefix="/azure", tags=["Azure Configuration"])

@router.get("/settings", response_model=AzureSettingsResponse)
def get_settings(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    db_settings = db.query(AzureSettings).filter(AzureSettings.id == 1).first()
    if not db_settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Azure settings not configured"
        )
    
    return AzureSettingsResponse(
        tenant_id=decrypt_secret(db_settings.tenant_id),
        client_id=decrypt_secret(db_settings.client_id),
        subscription_id=decrypt_secret(db_settings.subscription_id),
        has_secret=bool(db_settings.client_secret)
    )

@router.post("/settings", response_model=AzureSettingsResponse)
def update_settings(
    settings_data: AzureSettingsCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    db_settings = db.query(AzureSettings).filter(AzureSettings.id == 1).first()
    
    # Encrypt all values
    encrypted_tenant = encrypt_secret(settings_data.tenant_id)
    encrypted_client = encrypt_secret(settings_data.client_id)
    encrypted_secret = encrypt_secret(settings_data.client_secret)
    encrypted_sub = encrypt_secret(settings_data.subscription_id)
    
    if not db_settings:
        db_settings = AzureSettings(
            id=1,
            tenant_id=encrypted_tenant,
            client_id=encrypted_client,
            client_secret=encrypted_secret,
            subscription_id=encrypted_sub,
            is_configured=True
        )
        db.add(db_settings)
    else:
        db_settings.tenant_id = encrypted_tenant
        db_settings.client_id = encrypted_client
        db_settings.client_secret = encrypted_secret
        db_settings.subscription_id = encrypted_sub
        db_settings.is_configured = True
        
    db.commit()
    db.refresh(db_settings)
    
    return AzureSettingsResponse(
        tenant_id=settings_data.tenant_id,
        client_id=settings_data.client_id,
        subscription_id=settings_data.subscription_id,
        has_secret=True
    )

@router.post("/test")
def test_azure_connection(
    settings_data: AzureSettingsCreate = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Test the Azure credentials.
    If credentials are provided in request, test those.
    Otherwise, test saved credentials.
    Runs synchronously using standard 'def' to utilize FastAPI thread pool.
    """
    try:
        if settings_data:
            # Test input credentials
            credential = ClientSecretCredential(
                tenant_id=settings_data.tenant_id,
                client_id=settings_data.client_id,
                client_secret=settings_data.client_secret
            )
            sub_id = settings_data.subscription_id
        else:
            # Test saved credentials
            credential, sub_id = get_azure_credentials(db)
            
        # Initialize Resource Client and try to list resource groups
        resource_client = ResourceManagementClient(credential, sub_id)
        # Fetching a single item confirms authentication and subscription-level read rights
        rg_list = list(resource_client.resource_groups.list(top=1))
        
        return {"status": "success", "message": f"Connection verified. Found {len(rg_list)} resource group(s)."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection test failed: {str(e)}"
        )
