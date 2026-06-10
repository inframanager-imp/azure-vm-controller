import logging
import time
from typing import Dict, List, Optional, Any
from concurrent.futures import ThreadPoolExecutor
from cryptography.fernet import Fernet

from azure.identity import ClientSecretCredential
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.resource import ResourceManagementClient
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AzureSettings, VMGrant
from app.schemas import VMInfo

logger = logging.getLogger("azure_client")

# In-memory global cache for VM power states
# Format: { f"{resource_group}/{vm_name}": VMInfo }
VM_CACHE: Dict[str, Dict[str, Any]] = {}
LAST_CACHE_REFRESH: float = 0.0
CACHE_IS_REFRESHING: bool = False

def populate_mock_vms():
    global VM_CACHE
    if VM_CACHE:
        return
    mock_data = {
        "gyan-test/automation-test": {
            "name": "Automation-Test",
            "resource_group": "gyan-test",
            "location": "eastus",
            "size": "Standard_B2ms",
            "power_state": "Running"
        },
        "cwb-dev/cwb-app-dev": {
            "name": "cwb-app-dev",
            "resource_group": "cwb-dev",
            "location": "eastus2",
            "size": "Standard_B2s",
            "power_state": "Running"
        },
        "cwb-demo/cwb-apps-01": {
            "name": "cwb-apps-01",
            "resource_group": "cwb-demo",
            "location": "eastus2",
            "size": "Standard_D2s_v3",
            "power_state": "Running"
        },
        "cwb-dev/cwb-data-01": {
            "name": "cwb-data-01",
            "resource_group": "cwb-dev",
            "location": "eastus2",
            "size": "Standard_D2s_v3",
            "power_state": "Stopped (deallocated)"
        },
        "cwb-dev/cwb-mcq-gpu-wks-01": {
            "name": "CWB-MCQ-GPU-WKS-01",
            "resource_group": "cwb-dev",
            "location": "eastus2",
            "size": "Standard_NV12ads_A10_v6",
            "power_state": "Stopped (deallocated)"
        },
        "gyan-das/gyan-engine-das-2": {
            "name": "gyan-engine-das-2",
            "resource_group": "gyan-das",
            "location": "eastus2",
            "size": "Standard_D8s_v3",
            "power_state": "Running"
        },
        "gyan-das/gyan-engine-das-3": {
            "name": "gyan-engine-das-3",
            "resource_group": "gyan-das",
            "location": "eastus2",
            "size": "Standard_D8s_v3",
            "power_state": "Running"
        },
        "gyan-demo/gyan-engine-demo-1": {
            "name": "gyan-engine-demo-1",
            "resource_group": "gyan-demo",
            "location": "eastus2",
            "size": "Standard_D8s_v3",
            "power_state": "Running"
        },
        "gyan-legal/nda-ds-server-v2": {
            "name": "nda-ds-server-v2",
            "resource_group": "gyan-legal",
            "location": "eastus2",
            "size": "Standard_B2s",
            "power_state": "Running"
        },
        "gyan-collection-ingestion/rapid-gyan-engine-2": {
            "name": "rapid-gyan-engine-2",
            "resource_group": "gyan-collection-ingestion",
            "location": "eastus2",
            "size": "Standard_D8s_v3",
            "power_state": "Running"
        },
        "gyan-benchmarking/relevance-benchmarking-01": {
            "name": "relevance-benchmarking-01",
            "resource_group": "gyan-benchmarking",
            "location": "eastus2",
            "size": "Standard_D8s_v3",
            "power_state": "Running"
        },
        "cwb-prod/workbench": {
            "name": "workbench",
            "resource_group": "cwb-prod",
            "location": "eastus2",
            "size": "Standard_D8s_v3",
            "power_state": "Running"
        }
    }
    VM_CACHE.update(mock_data)


def get_fernet() -> Fernet:
    return Fernet(settings.FERNET_KEY.encode())

def encrypt_secret(plain_text: str) -> str:
    if not plain_text:
        return ""
    f = get_fernet()
    return f.encrypt(plain_text.encode()).decode()

def decrypt_secret(encrypted_text: str) -> str:
    if not encrypted_text:
        return ""
    f = get_fernet()
    return f.decrypt(encrypted_text.encode()).decode()

def get_azure_credentials(db: Session) -> tuple[ClientSecretCredential, str]:
    """
    Returns (credential, subscription_id) by fetching from database and decrypting.
    Raises ValueError if Azure settings are not configured.
    """
    db_settings = db.query(AzureSettings).filter(AzureSettings.id == 1).first()
    if not db_settings or not db_settings.is_configured:
        raise ValueError("Azure settings are not configured in the database.")
    
    tenant_id = decrypt_secret(db_settings.tenant_id)
    client_id = decrypt_secret(db_settings.client_id)
    client_secret = decrypt_secret(db_settings.client_secret)
    subscription_id = decrypt_secret(db_settings.subscription_id)
    
    credential = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret
    )
    return credential, subscription_id

def get_resource_client(db: Session) -> ResourceManagementClient:
    credential, subscription_id = get_azure_credentials(db)
    return ResourceManagementClient(credential, subscription_id)

def get_compute_client(db: Session) -> ComputeManagementClient:
    credential, subscription_id = get_azure_credentials(db)
    return ComputeManagementClient(credential, subscription_id)

def map_power_state(statuses: List[Any]) -> str:
    """
    Maps Azure status codes (e.g. PowerState/running) to custom statuses.
    """
    for status in statuses:
        code = getattr(status, "code", "")
        if code == "PowerState/running":
            return "Running"
        elif code == "PowerState/deallocated":
            return "Stopped (deallocated)"
        elif code == "PowerState/stopped":
            return "Stopped (allocated - billing active)"
        elif code == "PowerState/starting":
            return "Starting"
        elif code == "PowerState/stopping":
            return "Stopping"
    return "Unknown"

def fetch_single_vm_status(compute_client: ComputeManagementClient, resource_group: str, vm_name: str) -> str:
    """
    Helper to fetch the live power status of a single VM.
    """
    try:
        vm_view = compute_client.virtual_machines.get(resource_group, vm_name, expand="instanceView")
        return map_power_state(vm_view.instance_view.statuses)
    except Exception as e:
        logger.error(f"Error fetching status for {resource_group}/{vm_name}: {str(e)}")
        return "Unknown"

def refresh_vm_cache(db: Session) -> bool:
    """
    Fetches all VMs in the subscription, queries their power state in parallel,
    and updates the in-memory VM_CACHE.
    """
    global VM_CACHE, LAST_CACHE_REFRESH, CACHE_IS_REFRESHING
    if CACHE_IS_REFRESHING:
        return False
        
    CACHE_IS_REFRESHING = True
    try:
        compute_client = get_compute_client(db)
        
        # List all VMs in the subscription
        vms_iterable = compute_client.virtual_machines.list_all()
        vms_list = list(vms_iterable)
        
        new_cache = {}
        
        # Helper function to process a single VM
        def process_vm(vm):
            # VM ID looks like: /subscriptions/{sub}/resourceGroups/{rg}/providers/...
            # Extract Resource Group name
            parts = vm.id.split('/')
            rg = ""
            for i, part in enumerate(parts):
                if part.lower() == "resourcegroups" and i + 1 < len(parts):
                    rg = parts[i+1]
                    break
            
            # Fetch instanceView for power state
            power_state = fetch_single_vm_status(compute_client, rg, vm.name)
            
            # Map size
            size = getattr(vm, "hardware_profile", None)
            size_str = size.vm_size if size else "Unknown"
            
            key = f"{rg}/{vm.name}".lower()
            new_cache[key] = {
                "name": vm.name,
                "resource_group": rg,
                "location": vm.location,
                "size": size_str,
                "power_state": power_state
            }

        # Run status fetches in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=10) as executor:
            executor.map(process_vm, vms_list)
            
        VM_CACHE.clear()
        VM_CACHE.update(new_cache)
        LAST_CACHE_REFRESH = time.time()
        logger.info(f"Successfully refreshed VM Cache with {len(VM_CACHE)} VMs.")
        return True
    except Exception as e:
        logger.error(f"Failed to refresh VM cache: {str(e)}")
        return False
    finally:
        CACHE_IS_REFRESHING = False

def check_user_grant(user_role: str, grants: List[VMGrant], resource_group: str, vm_name: str) -> Optional[Dict[str, bool]]:
    """
    Checks if a user is authorized for a specific VM/RG based on grants.
    Returns allowed action permissions (can_start, can_stop, can_restart) or None if no access.
    """
    if user_role == "admin":
        return {"can_start": True, "can_stop": True, "can_restart": True}
        
    resource_group_lower = resource_group.lower()
    vm_name_lower = vm_name.lower()
    
    # Check all grants
    for grant in grants:
        grant_rg = grant.resource_group.lower()
        grant_vm = grant.vm_name.lower()
        
        # Match RG (or "*" for all RGs)
        rg_match = (grant_rg == "*") or (grant_rg == resource_group_lower)
        # Match VM (or "*" for all VMs in that RG)
        vm_match = (grant_vm == "*") or (grant_vm == vm_name_lower)
        
        if rg_match and vm_match:
            return {
                "can_start": grant.can_start,
                "can_stop": grant.can_stop,
                "can_restart": grant.can_restart
            }
            
    return None

def list_allowed_vms(user_role: str, user_grants: List[VMGrant]) -> List[VMInfo]:
    """
    Returns filtered list of VMs from the cache based on user grants.
    """
    populate_mock_vms()
    allowed_vms = []
    
    for key, cached_vm in VM_CACHE.items():
        rg = cached_vm["resource_group"]
        name = cached_vm["name"]
        
        permissions = check_user_grant(user_role, user_grants, rg, name)
        if permissions:
            # Add action strings that are allowed
            allowed_actions = []
            if permissions["can_start"]:
                allowed_actions.append("start")
            if permissions["can_stop"]:
                allowed_actions.append("stop")
            if permissions["can_restart"]:
                allowed_actions.append("restart")
                
            allowed_vms.append(VMInfo(
                name=name,
                resource_group=rg,
                location=cached_vm["location"],
                size=cached_vm["size"],
                power_state=cached_vm["power_state"],
                allowed_actions=allowed_actions
            ))
            
    return allowed_vms

def execute_vm_action(db: Session, resource_group: str, vm_name: str, action: str, username: str) -> str:
    """
    Triggers a VM power action asynchronously in a background thread.
    Updates cache state to transitioning immediately and returns it,
    updating to final state upon operation completion.
    """
    import threading
    import time
    cache_key = f"{resource_group}/{vm_name}".lower()
    
    # 1. Update transitional state in cache immediately
    if action == "start":
        trans_state = "Starting"
    elif action == "stop":
        trans_state = "Stopping"
    elif action == "restart":
        trans_state = "Restarting"
    else:
        raise ValueError(f"Invalid action: {action}")
        
    if cache_key not in VM_CACHE:
        VM_CACHE[cache_key] = {
            "name": vm_name,
            "resource_group": resource_group,
            "location": "eastus2",
            "size": "Standard_B2s",
            "power_state": trans_state
        }
    else:
        VM_CACHE[cache_key]["power_state"] = trans_state
        
    # 2. Check if Azure settings are configured
    is_azure_configured = False
    try:
        db_settings = db.query(AzureSettings).filter(AzureSettings.id == 1).first()
        if db_settings and db_settings.is_configured:
            is_azure_configured = True
    except Exception:
        pass
        
    if is_azure_configured:
        # Run real Azure call in background
        def run_azure_async():
            try:
                from app.database import SessionLocal
                local_db = SessionLocal()
                try:
                    compute_client = get_compute_client(local_db)
                    if action == "start":
                        poller = compute_client.virtual_machines.begin_start(resource_group, vm_name)
                    elif action == "stop":
                        poller = compute_client.virtual_machines.begin_deallocate(resource_group, vm_name)
                    elif action == "restart":
                        poller = compute_client.virtual_machines.begin_restart(resource_group, vm_name)
                    poller.result()
                    
                    final_state = fetch_single_vm_status(compute_client, resource_group, vm_name)
                    VM_CACHE[cache_key]["power_state"] = final_state
                finally:
                    local_db.close()
            except Exception as ex:
                logger.error(f"Async VM action {action} failed for {resource_group}/{vm_name}: {str(ex)}")
                VM_CACHE[cache_key]["power_state"] = "Unknown"
        
        threading.Thread(target=run_azure_async, daemon=True).start()
    else:
        # Run mock delay (6 seconds transition) in background
        def run_mock_async():
            time.sleep(6)
            if action == "start":
                VM_CACHE[cache_key]["power_state"] = "Running"
            elif action == "stop":
                VM_CACHE[cache_key]["power_state"] = "Stopped (deallocated)"
            elif action == "restart":
                VM_CACHE[cache_key]["power_state"] = "Running"
        
        threading.Thread(target=run_mock_async, daemon=True).start()
        
    return trans_state
