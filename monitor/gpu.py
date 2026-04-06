import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger("magictools.monitor.gpu")

@dataclass
class GPUStats:
    index: int = 0
    name: str = "Unknown"
    gpu_utilization: float = -1.0
    gpu_temperature: float = -1.0
    vram_total: int = 0
    vram_used: int = 0
    vram_used_percent: float = -1.0


@dataclass
class GPUInfo:
    device_type: str = "cpu"
    gpus: list[GPUStats] = field(default_factory=list)


class GPUMonitor:

    def __init__(self):
        self._available = False
        self._handles: list = []
        self._gpu_names: list[str] = []
        self._visible_indices: list[int] | None = None
        self._pynvml = None
        self.gpu_utilization_enabled: list[bool] = []
        self.gpu_vram_enabled: list[bool] = []
        self.gpu_temperature_enabled: list[bool] = []

        self._init_pynvml()

    def _init_pynvml(self):
        try:
            import pynvml
            pynvml.nvmlInit()
        except Exception as e:
            logger.info(f"nvidia-ml-py not available ({e}). GPU monitoring disabled.")
            return

        self._pynvml = pynvml

        try:
            device_count = pynvml.nvmlDeviceGetCount()
        except Exception:
            device_count = 0

        if device_count == 0:
            logger.info("nvidia-ml-py reports 0 devices. GPU monitoring disabled (ZLUDA or no NVIDIA GPU).")
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass
            self._pynvml = None
            return

        self._visible_indices = self._parse_visible_devices(device_count)
        indices_to_monitor = self._visible_indices if self._visible_indices is not None else list(range(device_count))

        for idx in indices_to_monitor:
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
                self._handles.append(handle)

                try:
                    raw_name = pynvml.nvmlDeviceGetName(handle)
                    name = raw_name.decode("utf-8", errors="replace") if isinstance(raw_name, bytes) else str(raw_name)
                except Exception:
                    name = f"GPU {idx}"

                self._gpu_names.append(name)
                self.gpu_utilization_enabled.append(True)
                self.gpu_vram_enabled.append(True)
                self.gpu_temperature_enabled.append(True)

                logger.info(f"Monitoring GPU {idx}: {name}")
            except Exception as e:
                logger.warning(f"Failed to get handle for GPU {idx}: {e}")

        if self._handles:
            self._available = True
            try:
                driver = pynvml.nvmlSystemGetDriverVersion()
                if isinstance(driver, bytes):
                    driver = driver.decode("utf-8", errors="replace")
                logger.info(f"NVIDIA driver version: {driver}")
            except Exception:
                pass
        else:
            logger.info("No usable GPU handles obtained. GPU monitoring disabled.")
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass
            self._pynvml = None

    @staticmethod
    def _parse_visible_devices(total_count: int) -> list[int] | None:
        env = os.environ.get("CUDA_VISIBLE_DEVICES")
        if not env:
            return None

        indices = []
        for part in env.split(","):
            part = part.strip()
            try:
                idx = int(part)
                if 0 <= idx < total_count:
                    indices.append(idx)
            except ValueError:
                return None

        return indices if indices else None

    @property
    def available(self) -> bool:
        return self._available

    @property
    def device_count(self) -> int:
        return len(self._handles)

    def get_gpu_list(self) -> list[dict]:
        return [
            {"index": i, "name": self._gpu_names[i]}
            for i in range(len(self._handles))
        ]

    def get_stats(self) -> GPUInfo:
        if not self._available:
            return GPUInfo(device_type="cpu")

        pynvml = self._pynvml
        gpus = []

        for i, handle in enumerate(self._handles):
            stats = GPUStats(index=i, name=self._gpu_names[i])

            # GPU utilization %.
            if self.gpu_utilization_enabled[i]:
                try:
                    rates = pynvml.nvmlDeviceGetUtilizationRates(handle)
                    stats.gpu_utilization = float(rates.gpu)
                except Exception:
                    stats.gpu_utilization = -1.0

            # VRAM usage.
            if self.gpu_vram_enabled[i]:
                try:
                    mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                    stats.vram_total = mem.total
                    stats.vram_used = mem.used
                    stats.vram_used_percent = (mem.used / mem.total * 100) if mem.total > 0 else 0.0
                except Exception:
                    pass

            # Temperature.
            if self.gpu_temperature_enabled[i]:
                try:
                    stats.gpu_temperature = float(
                        pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                    )
                except Exception:
                    stats.gpu_temperature = -1.0

            gpus.append(stats)

        return GPUInfo(device_type="cuda", gpus=gpus)

    def shutdown(self):
        if self._pynvml:
            try:
                self._pynvml.nvmlShutdown()
            except Exception:
                pass
            self._pynvml = None
            self._available = False
