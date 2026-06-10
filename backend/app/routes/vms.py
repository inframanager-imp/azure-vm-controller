import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, AuditLog
from app.schemas import VMInfo
from app.azure_client import (
    list_allowed_vms, execute_vm_action, check_user_grant, VM_CACHE, refresh_vm_cache
)

router = APIRouter(prefix="/vms", tags=["Virtual Machines"])

def check_action_permission(user: User, resource_group: str, vm_name: str, action: str) -> bool:
    """
    Checks if the user has permission to execute the given action on a specific VM.
    Admins bypass check. Standard users must match an active VMGrant allowing the action.
    """
    if user.role == "admin":
        return True
        
    permissions = check_user_grant(user.role, user.grants, resource_group, vm_name)
    if not permissions:
        return False
        
    if action == "start":
        return permissions["can_start"]
    elif action == "stop":
        return permissions["can_stop"]
    elif action == "restart":
        return permissions["can_restart"]
        
    return False

def get_stable_uptime(vm_name: str, power_state: str) -> str:
    if "running" not in power_state.lower():
        return "—"
    uptimes = {
        "automation-test": "5d 12h",
        "cwb-app-dev": "3d 1h",
        "cwb-apps-01": "6d 9h",
        "gyan-engine-das-2": "11d 7h",
        "gyan-engine-das-3": "11d 7h",
        "gyan-engine-demo-1": "1d 18h",
        "nda-ds-server-v2": "19d 5h",
        "rapid-gyan-engine-2": "2d 4h",
        "relevance-benchmarking-01": "8h",
        "workbench": "34d 2h"
    }
    return uptimes.get(vm_name.lower(), "2d 6h")

def get_schedule_time(cron_str: str) -> str:
    parts = cron_str.split()
    if len(parts) >= 2:
        try:
            minute = int(parts[0])
            hour = int(parts[1])
            return f"{hour:02d}:{minute:02d}"
        except ValueError:
            pass
    return "19:00"

@router.get("", response_model=List[VMInfo])
def get_vms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves all virtual machines the caller is authorized to view.
    Reads from the background VM status cache to prevent ARM rate-limiting.
    Enriches with active VM schedules and uptime mock values.
    """
    from app.models import Schedule
    schedules = db.query(Schedule).filter(Schedule.is_enabled == True).all()
    
    vm_schedules = {}
    rg_schedules = {}
    for s in schedules:
        if s.target_type == "vm" and s.vm_name:
            vm_schedules[(s.resource_group.lower(), s.vm_name.lower())] = s
        elif s.target_type == "rg":
            rg_schedules[s.resource_group.lower()] = s
            
    vms_list = list_allowed_vms(current_user.role, current_user.grants)
    
    for vm in vms_list:
        sched = vm_schedules.get((vm.resource_group.lower(), vm.name.lower()))
        if not sched:
            sched = rg_schedules.get(vm.resource_group.lower())
            
        if sched and sched.action == "stop":
            time_str = get_schedule_time(sched.cron_expression)
            vm.schedule = f"auto-stop {time_str}"
        elif sched and sched.action == "start":
            time_str = get_schedule_time(sched.cron_expression)
            vm.schedule = f"auto-start {time_str}"
            
        vm.uptime = get_stable_uptime(vm.name, vm.power_state)
        
    return vms_list

@router.post("/refresh")
def force_refresh_cache(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manual cache refresh trigger. Useful if user wants immediate full reload.
    """
    success = refresh_vm_cache(db)
    if success:
        return {"status": "success", "message": "VM Cache refreshed successfully."}
    else:
        return {"status": "skipped", "message": "VM Cache is already refreshing or failed to load settings."}

@router.get("/resource-groups", response_model=List[str])
def get_resource_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns unique resource groups from cached VMs that the user has permission to see.
    """
    # Extract unique RGs from cached VMs
    rgs = set()
    for cached_vm in VM_CACHE.values():
        rg = cached_vm["resource_group"]
        name = cached_vm["name"]
        
        # Admin gets everything, user needs at least list access to VM/RG
        if check_user_grant(current_user.role, current_user.grants, rg, name):
            rgs.add(rg)
            
    return sorted(list(rgs))

@router.post("/{rg}/{name}/start")
def start_virtual_machine(
    rg: str,
    name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Starts an Azure Virtual Machine. Enforces user permission.
    """
    if not check_action_permission(current_user, rg, name, "start"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to start VM {name} in Resource Group {rg}."
        )
        
    try:
        final_state = execute_vm_action(
            db=db,
            resource_group=rg,
            vm_name=name,
            action="start",
            username=current_user.username
        )
        # Log audit entry
        audit_log = AuditLog(
            username=current_user.username,
            vm_name=name,
            action="start",
            result="success",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        return {"status": "success", "power_state": final_state}
    except Exception as e:
        audit_log = AuditLog(
            username=current_user.username,
            vm_name=name,
            action="start",
            result=f"failed: {str(e)}",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start VM: {str(e)}"
        )

@router.post("/{rg}/{name}/stop")
def stop_virtual_machine(
    rg: str,
    name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Stops (deallocates) an Azure Virtual Machine. Enforces user permission.
    """
    if not check_action_permission(current_user, rg, name, "stop"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to stop VM {name} in Resource Group {rg}."
        )
        
    try:
        final_state = execute_vm_action(
            db=db,
            resource_group=rg,
            vm_name=name,
            action="stop",
            username=current_user.username
        )
        # Log audit entry
        audit_log = AuditLog(
            username=current_user.username,
            vm_name=name,
            action="stop (deallocate)",
            result="success",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        return {"status": "success", "power_state": final_state}
    except Exception as e:
        audit_log = AuditLog(
            username=current_user.username,
            vm_name=name,
            action="stop (deallocate)",
            result=f"failed: {str(e)}",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop VM: {str(e)}"
        )

@router.post("/{rg}/{name}/restart")
def restart_virtual_machine(
    rg: str,
    name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Restarts an Azure Virtual Machine. Enforces user permission.
    """
    if not check_action_permission(current_user, rg, name, "restart"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to restart VM {name} in Resource Group {rg}."
        )
        
    try:
        final_state = execute_vm_action(
            db=db,
            resource_group=rg,
            vm_name=name,
            action="restart",
            username=current_user.username
        )
        # Log audit entry
        audit_log = AuditLog(
            username=current_user.username,
            vm_name=name,
            action="restart",
            result="success",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        return {"status": "success", "power_state": final_state}
    except Exception as e:
        audit_log = AuditLog(
            username=current_user.username,
            vm_name=name,
            action="restart",
            result=f"failed: {str(e)}",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to restart VM: {str(e)}"
        )

@router.get("/{rg}/{name}/status")
def get_vm_status(
    rg: str,
    name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Returns the current cached power state of the VM.
    Enforces user permission checks.
    """
    if current_user.role != "admin":
        permissions = check_user_grant(current_user.role, current_user.grants, rg, name)
        if not permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied to VM {name} in resource group {rg}."
            )
            
    cache_key = f"{rg}/{name}".lower()
    if cache_key in VM_CACHE:
        return {"status": "success", "power_state": VM_CACHE[cache_key]["power_state"]}
    else:
        from app.azure_client import populate_mock_vms
        populate_mock_vms()
        if cache_key in VM_CACHE:
            return {"status": "success", "power_state": VM_CACHE[cache_key]["power_state"]}
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VM not found in cache."
        )

@router.get("/{rg}/{name}/metrics")
def get_vm_metrics(
    rg: str,
    name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Returns mock CPU, Memory, and Network I/O metrics for the VM detail drawer.
    """
    if current_user.role != "admin":
        permissions = check_user_grant(current_user.role, current_user.grants, rg, name)
        if not permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied."
            )
            
    import random
    seed_val = sum(ord(c) for c in name)
    random.seed(seed_val)
    
    cpu = [random.randint(2, 45) for _ in range(15)]
    memory = [random.randint(35, 78) for _ in range(15)]
    network = [random.randint(5, 320) for _ in range(15)]
    
    return {
        "status": "success",
        "cpu": cpu,
        "memory": memory,
        "network": network
    }
