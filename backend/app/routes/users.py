from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_admin, get_password_hash
from app.models import User, VMGrant
from app.schemas import UserCreate, UserUpdate, UserResponse, VMGrantCreate

router = APIRouter(prefix="/users", tags=["Users Management"])

@router.get("", response_model=List[UserResponse])
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return db.query(User).all()

@router.post("", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    # Check if user already exists
    existing_user = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or Email already registered"
        )
        
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        is_active=user_data.is_active,
        password_hash=get_password_hash(user_data.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/{id}", response_model=UserResponse)
def update_user(
    id: int,
    user_data: UserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    # Prevent self-disabling or role downgrade for safety
    if user.id == current_user.id:
        if user_data.is_active is False or (user_data.role and user_data.role != "admin"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot downgrade or deactivate your own admin account."
            )
            
    if user_data.email:
        # Check email conflict
        conflict = db.query(User).filter(User.email == user_data.email, User.id != id).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already in use by another user."
            )
        user.email = user_data.email
        
    if user_data.role:
        user.role = user_data.role
        
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
        
    if user_data.password:
        user.password_hash = get_password_hash(user_data.password)
        
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{id}")
def delete_user(
    id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own admin account."
        )
        
    db.delete(user)
    db.commit()
    return {"status": "success", "message": "User account deleted."}

@router.post("/{id}/access", response_model=UserResponse)
def update_user_grants(
    id: int,
    grants_data: List[VMGrantCreate],
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Replaces existing access grants for a user with the provided list.
    """
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    # Delete all current grants for this user
    db.query(VMGrant).filter(VMGrant.user_id == id).delete()
    
    # Insert new grants
    for grant in grants_data:
        new_grant = VMGrant(
            user_id=id,
            resource_group=grant.resource_group,
            vm_name=grant.vm_name,
            can_start=grant.can_start,
            can_stop=grant.can_stop,
            can_restart=grant.can_restart
        )
        db.add(new_grant)
        
    db.commit()
    db.refresh(user)
    return user
