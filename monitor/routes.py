import logging

import os
import sys
import threading
import time

from aiohttp import web
from server import PromptServer

from .collector import monitor_instance

logger = logging.getLogger("magictools.monitor.routes")

@PromptServer.instance.routes.patch("/magictools/monitor")
async def update_settings(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    hw = monitor_instance.hardware

    if "switchCPU" in body:
        hw.cpu_enabled = bool(body["switchCPU"])
    if "switchRAM" in body:
        hw.ram_enabled = bool(body["switchRAM"])
    if "switchDisk" in body:
        hw.disk_enabled = bool(body["switchDisk"])
    if "whichDisk" in body:
        hw.disk_path = str(body["whichDisk"])

    if "rate" in body:
        new_rate = float(body["rate"])
        old_rate = monitor_instance.rate
        monitor_instance.rate = new_rate

        if new_rate <= 0:
            monitor_instance.stop()
        elif old_rate <= 0 and new_rate > 0:
            monitor_instance.start()
        elif monitor_instance.is_running:
            monitor_instance.start()

    return web.json_response({"status": "ok"})


@PromptServer.instance.routes.post("/magictools/monitor/switch")
async def switch_monitor(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    if body.get("monitor", False):
        if not monitor_instance.is_running:
            monitor_instance.start()
    else:
        monitor_instance.stop()

    return web.json_response({"status": "ok"})


@PromptServer.instance.routes.get("/magictools/monitor/disk")
async def get_disk_list(_request: web.Request) -> web.Response:
    from .hardware import HardwareInfo
    partitions = HardwareInfo.get_disk_partitions()
    return web.json_response(partitions)


@PromptServer.instance.routes.get("/magictools/monitor/gpu")
async def get_gpu_list(_request: web.Request) -> web.Response:
    gpus = monitor_instance.gpu_monitor.get_gpu_list()
    return web.json_response(gpus)


@PromptServer.instance.routes.patch("/magictools/monitor/gpu/{index}")
async def update_gpu_settings(request: web.Request) -> web.Response:
    try:
        idx = int(request.match_info["index"])
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid request"}, status=400)

    gpu = monitor_instance.gpu_monitor
    if idx < 0 or idx >= gpu.device_count:
        return web.json_response({"error": "GPU index out of range"}, status=404)

    if "utilization" in body:
        gpu.gpu_utilization_enabled[idx] = bool(body["utilization"])
    if "vram" in body:
        gpu.gpu_vram_enabled[idx] = bool(body["vram"])
    if "temperature" in body:
        gpu.gpu_temperature_enabled[idx] = bool(body["temperature"])

    return web.json_response({"status": "ok"})

def restart_comfyui():
    """Restart ComfyUI by re-executing the current process."""
    time.sleep(0.5)  # Give time for response to be sent
    os.execv(sys.executable, [sys.executable] + sys.argv)

@PromptServer.instance.routes.post("/magictools/restart")
async def restart_server(request):
    """API endpoint to restart the server."""
    threading.Thread(target=restart_comfyui, daemon=True).start()    
    return web.json_response({"status": "ok"})
