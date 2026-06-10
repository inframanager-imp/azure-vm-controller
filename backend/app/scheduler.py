import logging
import datetime
import pytz
from typing import List
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Schedule, AuditLog
from app.azure_client import execute_vm_action, get_compute_client

logger = logging.getLogger("scheduler")

# Global APScheduler instance
scheduler = BackgroundScheduler()

def get_next_run_times(cron_expression: str, timezone_str: str, limit: int = 3) -> List[str]:
    """
    Computes upcoming next run times for a given cron expression and timezone.
    """
    try:
        tz = pytz.timezone(timezone_str)
        # APScheduler CronTrigger.from_crontab parses standard crontab formats
        trigger = CronTrigger.from_crontab(cron_expression, timezone=tz)
        
        runs = []
        now = datetime.datetime.now(tz)
        next_run = trigger.get_next_fire_time(None, now)
        
        for _ in range(limit):
            if not next_run:
                break
            runs.append(next_run.strftime("%Y-%m-%d %H:%M:%S %Z"))
            # Get fire time after the previous run
            next_run = trigger.get_next_fire_time(next_run, next_run)
            
        return runs
    except Exception as e:
        logger.error(f"Error computing next run times: {str(e)}")
        return []

def run_scheduled_job(schedule_id: int):
    """
    The target function executed by APScheduler.
    """
    db: Session = SessionLocal()
    try:
        # Fetch the schedule
        schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule or not schedule.is_enabled:
            return
            
        logger.info(f"Executing schedule '{schedule.name}' (ID: {schedule.id})")
        action = schedule.action.lower()  # "start" or "stop"
        
        if schedule.target_type == "vm":
            # Target is a single VM
            try:
                execute_vm_action(
                    db=db,
                    resource_group=schedule.resource_group,
                    vm_name=schedule.vm_name,
                    action=action,
                    username="scheduler"
                )
                # Log success
                log = AuditLog(
                    username="scheduler",
                    vm_name=schedule.vm_name,
                    action=f"{action} (schedule)",
                    result="success"
                )
                db.add(log)
                db.commit()
            except Exception as e:
                # Log failure
                log = AuditLog(
                    username="scheduler",
                    vm_name=schedule.vm_name,
                    action=f"{action} (schedule)",
                    result=f"failed: {str(e)}"
                )
                db.add(log)
                db.commit()
                
        elif schedule.target_type == "rg":
            # Target is a whole Resource Group
            # Rule 7: Loop VMs individually, log each separately, let the rest continue if one fails
            try:
                compute_client = get_compute_client(db)
                vms_in_rg = list(compute_client.virtual_machines.list(schedule.resource_group))
            except Exception as e:
                logger.error(f"Failed to list VMs in RG {schedule.resource_group} for schedule: {str(e)}")
                log = AuditLog(
                    username="scheduler",
                    vm_name=f"RG:{schedule.resource_group}",
                    action=f"{action} (schedule)",
                    result=f"failed: Could not list VMs in resource group: {str(e)}"
                )
                db.add(log)
                db.commit()
                return

            if not vms_in_rg:
                log = AuditLog(
                    username="scheduler",
                    vm_name=f"RG:{schedule.resource_group}",
                    action=f"{action} (schedule)",
                    result="success: No VMs found in Resource Group"
                )
                db.add(log)
                db.commit()
                return

            for vm in vms_in_rg:
                try:
                    execute_vm_action(
                        db=db,
                        resource_group=schedule.resource_group,
                        vm_name=vm.name,
                        action=action,
                        username="scheduler"
                    )
                    log = AuditLog(
                        username="scheduler",
                        vm_name=vm.name,
                        action=f"{action} (schedule)",
                        result="success"
                    )
                    db.add(log)
                except Exception as e:
                    logger.error(f"Schedule execution failed for VM {vm.name} in RG {schedule.resource_group}: {str(e)}")
                    log = AuditLog(
                        username="scheduler",
                        vm_name=vm.name,
                        action=f"{action} (schedule)",
                        result=f"failed: {str(e)}"
                    )
                    db.add(log)
                # Commit individual logs
                db.commit()
                
    except Exception as e:
        logger.error(f"Error executing scheduled job: {str(e)}")
    finally:
        db.close()

def sync_scheduler_jobs(db: Session):
    """
    Clears all existing jobs in APScheduler and re-adds all enabled schedules from the DB.
    """
    try:
        # Remove all existing scheduler jobs
        scheduler.remove_all_jobs()
        
        # Load all enabled schedules
        enabled_schedules = db.query(Schedule).filter(Schedule.is_enabled == True).all()
        
        for schedule in enabled_schedules:
            add_scheduler_job(schedule)
            
        logger.info(f"Synchronized scheduler: Loaded {len(enabled_schedules)} active schedules.")
    except Exception as e:
        logger.error(f"Failed to sync scheduler jobs: {str(e)}")

def add_scheduler_job(schedule: Schedule):
    """
    Adds a schedule to the APScheduler instance.
    """
    job_id = f"schedule_{schedule.id}"
    try:
        tz = pytz.timezone(schedule.timezone)
        trigger = CronTrigger.from_crontab(schedule.cron_expression, timezone=tz)
        
        # Remove job if it already exists (to update it)
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            
        scheduler.add_job(
            func=run_scheduled_job,
            trigger=trigger,
            args=[schedule.id],
            id=job_id,
            max_instances=1,
            replace_existing=True
        )
        logger.info(f"Added scheduled job {job_id} with cron '{schedule.cron_expression}' ({schedule.timezone})")
    except Exception as e:
        logger.error(f"Failed to add job {job_id}: {str(e)}")

def remove_scheduler_job(schedule_id: int):
    """
    Removes a schedule from the APScheduler instance.
    """
    job_id = f"schedule_{schedule_id}"
    try:
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            logger.info(f"Removed scheduled job {job_id}")
    except Exception as e:
        logger.error(f"Failed to remove job {job_id}: {str(e)}")
