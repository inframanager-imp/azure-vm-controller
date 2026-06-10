from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_admin
from app.models import User, AuditLog
from app.schemas import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["Audit Log"])

@router.get("", response_model=List[AuditLogResponse])
def get_audit_logs(
    username: Optional[str] = Query(None, description="Filter by operator username"),
    vm_name: Optional[str] = Query(None, description="Filter by VM name"),
    action: Optional[str] = Query(None, description="Filter by action executed"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Returns audit log entries, ordered by timestamp descending. Admin-only.
    """
    query = db.query(AuditLog)
    
    if username:
        query = query.filter(AuditLog.username.like(f"%{username}%"))
    if vm_name:
        query = query.filter(AuditLog.vm_name.like(f"%{vm_name}%"))
    if action:
        query = query.filter(AuditLog.action.like(f"%{action}%"))
        
    # Order by newest first
    return query.order_by(AuditLog.timestamp.desc()).all()
