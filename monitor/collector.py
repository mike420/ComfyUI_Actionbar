import asyncio
import logging
import threading

from .gpu import GPUMonitor
from .hardware import HardwareInfo

logger = logging.getLogger("magictools.monitor.collector")


class MonitorCollector:

    def __init__(self, default_rate: float = 1.0):
        self.gpu_monitor = GPUMonitor()
        self.hardware = HardwareInfo(self.gpu_monitor)
        self.rate = default_rate

        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

        if self.rate > 0:
            self.start()


    def start(self):
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                self.stop()

            if self.rate <= 0:
                logger.debug("Monitor rate is 0; not starting.")
                return

            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run_loop,
                name="MagicTools-Monitor",
                daemon=True,
            )
            self._thread.start()
            logger.info(f"Monitor started (rate={self.rate}s).")

    def stop(self):
        self._stop_event.set()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=5)
        self._thread = None
        logger.debug("Monitor stopped.")

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def _run_loop(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._poll_loop())
        except Exception as e:
            logger.error(f"Monitor loop crashed: {e}")
        finally:
            loop.close()

    async def _poll_loop(self):
        while not self._stop_event.is_set():
            try:
                data = self.hardware.get_stats().to_dict()
                await self._send(data)
            except Exception as e:
                logger.debug(f"Monitor poll error: {e}")

            self._stop_event.wait(timeout=self.rate)

    @staticmethod
    async def _send(data: dict):

        try:
            import server
            server.PromptServer.instance.send_sync("magictools.monitor", data)
        except Exception:
            pass  # Server not ready yet; silently skip.

monitor_instance = MonitorCollector(default_rate=1.0)
