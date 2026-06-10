from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Schedule
from app.schemas import ScheduleCreate, ScheduleResponse
from app.scheduler import add_scheduler_job, remove_scheduler_job, get_next_run_times
from app.routes.vms import check_action_permission

router = APIRouter(prefix="/schedules", tags=["Schedules"])

def verify_schedule_access(user: User, schedule_data: ScheduleCreate) -> bool:
    """
    Checks if a user is permitted to create/update a schedule for the specified target.
    """
    if user.role == "admin":
        return True
        
    rg = schedule_data.resource_group
    vm = schedule_data.vm_name if schedule_data.target_type == "vm" else "*"
    
    # User must have permission to start/stop the targeted VM(s)
    # We check if they have general start permission on the target
    return check_action_permission(user, rg, vm, "start")

@router.get("", response_model=List[ScheduleResponse])
def get_schedules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns list of schedules. Admin sees all schedules.
    Regular users only see schedules for VMs/RGs they have permission to control.
    """
    query = db.query(Schedule)
    if current_user.role != "admin":
        # Filter schedules. Since standard users can only control specific VMs,
        # we filter the DB query or filter programmatically. Programmatically is safer
        # because the grants can be complex.
        all_schedules = query.all()
        allowed_schedules = []
        for s in all_schedules:
            vm = s.vm_name if s.target_type == "vm" else "*"
            if check_action_permission(current_user, s.resource_group, vm, "start"):
                allowed_schedules.append(s)
        schedules_list = allowed_schedules
    else:
        schedules_list = query.all()
        
    # Append next-run times to the response models
    responses = []
    for s in schedules_list:
        next_runs = []
        if s.is_enabled:
            next_runs = get_next_run_times(s.cron_expression, s.timezone, limit=3)
            
        responses.append(ScheduleResponse(
            id=s.id,
            name=s.name,
            target_type=s.target_type,
            resource_group=s.resource_group,
            vm_name=s.vm_name,
            action=s.action,
            cron_expression=s.cron_expression,
            timezone=s.timezone,
            is_enabled=s.is_enabled,
            created_by=s.created_by,
            next_run_times=next_runs
        ))
    return responses

@router.post("", response_model=ScheduleResponse)
def create_schedule(
    schedule_data: ScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Creates a new VM schedule.
    """
    if not verify_schedule_access(current_user, schedule_data):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage schedules for this target."
        )
        
    new_schedule = Schedule(
        name=schedule_data.name,
        target_type=schedule_data.target_type,
        resource_group=schedule_data.resource_group,
        vm_name=schedule_data.vm_name if schedule_data.target_type == "vm" else None,
        action=schedule_data.action,
        cron_expression=schedule_data.cron_expression,
        timezone=schedule_data.timezone,
        is_enabled=schedule_data.is_enabled,
        created_by=current_user.username
    )
    
    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)
    
    # Sync with APScheduler
    if new_schedule.is_enabled:
        add_scheduler_job(new_schedule)
        
    next_runs = get_next_run_times(new_schedule.cron_expression, new_schedule.timezone)
    
    return ScheduleResponse(
        id=new_schedule.id,
        name=new_schedule.name,
        target_type=new_schedule.target_type,
        resource_group=new_schedule.resource_group,
        vm_name=new_schedule.vm_name,
        action=new_schedule.action,
        cron_expression=new_schedule.cron_expression,
        timezone=new_schedule.timezone,
        is_enabled=new_schedule.is_enabled,
        created_by=new_schedule.created_by,
        next_run_times=next_runs
    )

@router.put("/{id}", response_model=ScheduleResponse)
def update_schedule(
    id: int,
    schedule_data: ScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Updates an existing schedule.
    """
    schedule = db.query(Schedule).filter(Schedule.id == id).first()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
        
    # Enforce original access AND new target access
    original_target_valid = False
    if current_user.role == "admin":
        original_target_valid = True
    else:
        vm = schedule.vm_name if schedule.target_type == "vm" else "*"
        original_target_valid = check_action_permission(current_user, schedule.resource_group, vm, "start")
        
    if not original_target_valid or not verify_schedule_access(current_user, schedule_data):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage schedules for this target."
        )
        
    # Update fields
    schedule.name = schedule_data.name
    schedule.target_type = schedule_data.target_type
    schedule.resource_group = schedule_data.resource_group
    schedule.vm_name = schedule_data.vm_name if schedule_data.target_type == "vm" else None
    schedule.action = schedule_data.action
    schedule.cron_expression = schedule_data.cron_expression
    schedule.timezone = schedule_data.timezone
    schedule.is_enabled = schedule_data.is_enabled
    
    db.commit()
    db.refresh(schedule)
    
    # Sync with APScheduler
    if schedule.is_enabled:
        add_scheduler_job(schedule)
    else:
        remove_scheduler_job(schedule.id)
        
    next_runs = []
    if schedule.is_enabled:
        next_runs = get_next_run_times(schedule.cron_expression, schedule.timezone)
        
    return ScheduleResponse(
        id=schedule.id,
        name=schedule.name,
        target_type=schedule.target_type,
        resource_group=schedule.resource_group,
        vm_name=schedule.vm_name,
        action=schedule.action,
        cron_expression=schedule.cron_expression,
        timezone=schedule.timezone,
        is_enabled=schedule.is_enabled,
        created_by=schedule.created_by,
        next_run_times=next_runs
    )

@router.delete("/{id}")
def delete_schedule(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Deletes a schedule.
    """
    schedule = db.query(Schedule).filter(Schedule.id == id).first()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
        
    # Validate permission
    is_allowed = False
    if current_user.role == "admin":
        is_allowed = True
    else:
        vm = schedule.vm_name if schedule.target_type == "vm" else "*"
        is_allowed = check_action_permission(current_user, schedule.resource_group, vm, "start")
        
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this schedule."
        )
        
    # Remove from scheduler
    remove_scheduler_job(schedule.id)
    
    db.delete(schedule)
    db.commit()
    
    return {"status": "success", "message": "Schedule deleted successfully."}
