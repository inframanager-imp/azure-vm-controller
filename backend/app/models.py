import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)  # "admin" or "user"
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationship to user specific VM grants
    grants = relationship("VMGrant", back_populates="user", cascade="all, delete-orphan")


class AzureSettings(Base):
    __tablename__ = "azure_settings"

    # There should only be one row in this table (id=1) representing the global settings
    id = Column(Integer, primary_key=True, default=1)
    tenant_id = Column(String, nullable=False)       # Encrypted
    client_id = Column(String, nullable=False)       # Encrypted
    client_secret = Column(String, nullable=False)   # Encrypted
    subscription_id = Column(String, nullable=False) # Encrypted
    is_configured = Column(Boolean, default=True, nullable=False)


class VMGrant(Base):
    __tablename__ = "vm_grants"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    resource_group = Column(String, nullable=False)  # Name of RG or "*" for all
    vm_name = Column(String, nullable=False)         # Name of VM or "*" for all VMs in RG
    can_start = Column(Boolean, default=True, nullable=False)
    can_stop = Column(Boolean, default=True, nullable=False)
    can_restart = Column(Boolean, default=True, nullable=False)

    # Back relation
    user = relationship("User", back_populates="grants")


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    target_type = Column(String, nullable=False)     # "vm" or "rg"
    resource_group = Column(String, nullable=False)
    vm_name = Column(String, nullable=True)          # Null if target_type is "rg"
    action = Column(String, nullable=False)          # "start" or "stop" (deallocate)
    cron_expression = Column(String, nullable=False) # e.g. "0 20 * * 1-5"
    timezone = Column(String, default="Asia/Kolkata", nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_by = Column(String, nullable=False)      # Username of creator


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False)        # Username or "scheduler"
    vm_name = Column(String, nullable=False)         # VM name or Resource Group name (or "All")
    action = Column(String, nullable=False)          # "start", "stop", "restart", etc.
    result = Column(String, nullable=False)          # "success" or "failed: <error details>"
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
