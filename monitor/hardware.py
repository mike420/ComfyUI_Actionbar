import logging
import os
import platform
import sys
from dataclasses import dataclass

import psutil

from .gpu import GPUMonitor, GPUInfo

logger = logging.getLogger("magictools.monitor.hardware")

@dataclass
class SystemStats:
    cpu_utilization: float = -1.0
    ram_total: int = 0
    ram_used: int = 0
    ram_used_percent: float = -1.0
    disk_total: int = 0
    disk_used: int = 0
    disk_used_percent: float = -1.0
    disk_path: str = ""
    gpu_info: GPUInfo = None

    def to_dict(self) -> dict:
        gpu_list = []
        device_type = "cpu"
        if self.gpu_info:
            device_type = self.gpu_info.device_type
            for g in self.gpu_info.gpus:
                gpu_list.append({
                    "gpu_utilization": g.gpu_utilization,
                    "gpu_temperature": g.gpu_temperature,
                    "vram_total": g.vram_total,
                    "vram_used": g.vram_used,
                    "vram_used_percent": g.vram_used_percent,
                })

        return {
            "cpu_utilization": self.cpu_utilization,
            "ram_total": self.ram_total,
            "ram_used": self.ram_used,
            "ram_used_percent": self.ram_used_percent,
            "disk_total": self.disk_total,
            "disk_used": self.disk_used,
            "disk_used_percent": self.disk_used_percent,
            "disk_path": self.disk_path,
            "device_type": device_type,
            "gpus": gpu_list,
        }


def _get_cpu_name() -> str:
    system = platform.system()

    try:
        if system == "Windows":
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
            )
            name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            winreg.CloseKey(key)
            return name.strip()

        elif system == "Linux":
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()

        elif system == "Darwin":
            import subprocess
            result = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                return result.stdout.strip()

    except Exception as e:
        logger.debug(f"CPU name detection failed: {e}")

    return platform.processor() or "Unknown CPU"


class HardwareInfo:
    def __init__(self, gpu_monitor: GPUMonitor):
        self.gpu_monitor = gpu_monitor
        self.cpu_enabled = True
        self.ram_enabled = True
        self.disk_enabled = True

        self.disk_path = self._detect_comfyui_drive()

        cpu_name = _get_cpu_name()
        cpu_count = psutil.cpu_count(logical=True) or 0
        logger.info(f"CPU: {cpu_name} ({cpu_count} logical cores)")
        logger.info(f"Disk monitor default: {self.disk_path}")

    @staticmethod
    def _detect_comfyui_drive() -> str:
        try:
            import folder_paths
            base = folder_paths.base_path
        except Exception:
            base = os.getcwd()

        if sys.platform == "win32":
            drive = os.path.splitdrive(base)[0]
            return (drive + "\\") if drive else "C:\\"

        return "/"

    def get_stats(self) -> SystemStats:
        stats = SystemStats()

        if self.cpu_enabled:
            try:
                stats.cpu_utilization = psutil.cpu_percent(interval=None)
            except Exception:
                stats.cpu_utilization = -1.0

        if self.ram_enabled:
            try:
                mem = psutil.virtual_memory()
                stats.ram_total = mem.total
                stats.ram_used = mem.used
                stats.ram_used_percent = mem.percent
            except Exception:
                pass

        if self.disk_enabled and self.disk_path != "none":
            try:
                disk = psutil.disk_usage(self.disk_path)
                stats.disk_total = disk.total
                stats.disk_used = disk.used
                stats.disk_used_percent = disk.percent
                stats.disk_path = self.disk_path
            except Exception:
                pass

        stats.gpu_info = self.gpu_monitor.get_stats()

        return stats

    @staticmethod
    def get_disk_partitions() -> list[str]:
        try:
            partitions = [p.mountpoint for p in psutil.disk_partitions()]
        except Exception:
            partitions = []
        return ["none"] + partitions
