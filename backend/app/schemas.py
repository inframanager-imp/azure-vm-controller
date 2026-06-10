from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

# VM Grant Schemas
class VMGrantBase(BaseModel):
    resource_group: str
    vm_name: str
    can_start: bool = True
    can_stop: bool = True
    can_restart: bool = True

class VMGrantCreate(VMGrantBase):
    pass

class VMGrantResponse(VMGrantBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    username: str
    role: str = "user"  # "admin" or "user"
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None  # Reset password optional

class UserResponse(UserBase):
    id: int
    grants: List[VMGrantResponse] = []

    class Config:
        from_attributes = True

# Azure Settings Schemas
class AzureSettingsBase(BaseModel):
    tenant_id: str
    client_id: str
    subscription_id: str

class AzureSettingsCreate(AzureSettingsBase):
    client_secret: str

class AzureSettingsResponse(AzureSettingsBase):
    has_secret: bool = False

    class Config:
        from_attributes = True

# Schedule Schemas
class ScheduleBase(BaseModel):
    name: str
    target_type: str  # "vm" or "rg"
    resource_group: str
    vm_name: Optional[str] = None
    action: str  # "start" or "stop"
    cron_expression: str
    timezone: str = "Asia/Kolkata"
    is_enabled: bool = True

class ScheduleCreate(ScheduleBase):
    pass

class ScheduleResponse(ScheduleBase):
    id: int
    created_by: str
    next_run_times: List[str] = []

    class Config:
        from_attributes = True

# Audit Log Schemas
class AuditLogResponse(BaseModel):
    id: int
    username: str
    vm_name: str
    action: str
    result: str
    timestamp: datetime

    class Config:
        from_attributes = True

# VM Info Schemas
class VMInfo(BaseModel):
    name: str
    resource_group: str
    location: str
    size: str
    power_state: str  # "Running", "Stopped (deallocated)", "Starting", "Stopping", "Unknown"
    allowed_actions: List[str] = []  # ["start", "stop", "restart"] based on user grants
