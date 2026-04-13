import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "MagicTools.SystemMonitor";
const VERSION = "1.0.3"

const WS_EVENT = "magictools.monitor";
const API_BASE = "/magictools/monitor";

const BASE_METRICS = [
    { id: "cpu",  label: "CPU",   symbol: "%",  cssClass: "cpu" },
    { id: "ram",  label: "RAM",   symbol: "%",  cssClass: "ram" },
    { id: "disk", label: "Disk",  symbol: "%",  cssClass: "disk" },
];

// SVG Icons
const ICON_UNLOAD = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
const ICON_BRUSH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/></svg>`;
const ICON_RESTART = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
const ICON_SETTINGS = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z\"/></svg>`;
const ICON_MANAGER = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;

let gpuList = [];
let diskLabel = "Disk";

// --- Timer State ---
let startTime = null;
let accumulatedTime = 0; 
let animationFrameId = null;
let timerEl = null;
let timerVisible = true;
let refreshPromptShown = false;

const bars = {};
const maxVramUsed = {};
const enabled = { cpu: true, ram: true };
const gpuEnabled = {};

const UI_CLEANUP_MAP = {
    "MagicTools.UI.Hide Subgraph Breadcrumb": "mt_cleanup_hide_subgraph",
    "MagicTools.UI.Hide Job Progress Panel": "mt_cleanup_hide_jobprogress",
    "MagicTools.UI.Hide Error Triangle": "mt_cleanup_hide_error_triangle",
    "MagicTools.UI.Hide Extension Manager": "mt_cleanup_hide_ext_manager"
};

// --- Helpers ---
function showRefreshPrompt() {
    if (refreshPromptShown) return;
    refreshPromptShown = true;
    const prompt = document.createElement("div");
    prompt.className = "mt-refresh-prompt";
    prompt.innerHTML = `<span>Settings changed. Refresh to apply?</span><button class="mt-btn-refresh">Refresh</button><button class="mt-btn-dismiss">Dismiss</button>`;
    const [refreshBtn, dismissBtn] = prompt.querySelectorAll("button");
    refreshBtn.onclick = () => location.reload();
    dismissBtn.onclick = () => prompt.remove();
    document.body.appendChild(prompt);
}

function formatElapsed(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const remainderMs = Math.floor(ms % 1000);    
    return `⏱ ${m}:${s.toString().padStart(2, "0")}:${remainderMs.toString().padStart(3, "0")}`;
}

function resetTimer() {
    startTime = null;
    accumulatedTime = 0;
    if (timerEl) {
        timerEl.textContent = "⏱ 0:00:000";
        timerEl.style.color = "#fff";
    }
}

function startTimer() {
    if (!timerEl || !timerVisible) return;
    if (!startTime) startTime = Date.now();
    
	timerEl.classList.add("running");
    timerEl.style.color = "#fff";
    timerEl.style.display = "flex";

    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const update = () => {
        if (!startTime) return;
        const currentSegment = Date.now() - startTime;
        timerEl.textContent = formatElapsed(accumulatedTime + currentSegment);
        animationFrameId = requestAnimationFrame(update);
    };
    animationFrameId = requestAnimationFrame(update);
}

function stopTimer(status = false) {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
	
	if (timerEl) {
        timerEl.classList.remove("running");
    }
    
    if (startTime !== null) {
        accumulatedTime += (Date.now() - startTime);
        startTime = null;
    }

    if (!timerEl) return;
    if (!timerVisible) {
        timerEl.style.display = "none";
        return;
    }

    timerEl.textContent = formatElapsed(accumulatedTime);
    
    if (status === true) {
        timerEl.style.color = "#ff9800"; 
    } else if (status === 'cancel') {
        timerEl.style.color = "#f44336";
    } else {
        timerEl.style.color = "#4caf50";
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + units[i];
}

function loadStylesheet() {
    const cssUrl = new URL("systemMonitor.css", import.meta.url);
    if (!document.querySelector(`link[href="${cssUrl}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssUrl;
        document.head.appendChild(link);
    }
}

function createMonitorBar(cssClass, label) {
    const el = document.createElement("div");
    el.className = `sys-monitor ${cssClass}`;
    el.title = label;
    const slider = document.createElement("div");
    slider.className = "sys-slider";
    el.appendChild(slider);
    const nameEl = document.createElement("div");
    nameEl.className = "sys-label-name";
    nameEl.textContent = label;
    el.appendChild(nameEl);
    const valueEl = document.createElement("div");
    valueEl.className = "sys-label-value";
    valueEl.textContent = "0%";
    el.appendChild(valueEl);
    return { element: el, slider, nameEl, valueEl };
}

function updateMonitorBar(bar, label, percent, symbol = "%", extra = null) {
    if (!bar) return;
    if (percent < 0) { bar.element.classList.add("hidden"); return; }
    bar.element.classList.remove("hidden");
    
    const pct = Math.min(100, Math.max(0, percent));
    bar.slider.style.width = `${pct}%`;
    bar.slider.style.background = ""; 

    const isMemoryBar = bar.element.classList.contains("ram") || bar.element.classList.contains("vram");
    
    if (isMemoryBar) {
        if (pct >= 90) {
            bar.slider.style.background = "#d32f2f";
        } else if (pct >= 80) {
            bar.slider.style.background = "#ff9800";
        }
    }

    bar.nameEl.textContent = label;
    bar.valueEl.textContent = `${Math.round(pct)}${symbol}`;
    
    let tooltip = `${label}: ${pct.toFixed(1)}${symbol}`;
    if (extra?.used != null && extra?.total != null) {
        tooltip += `\n${formatBytes(extra.used)} / ${formatBytes(extra.total)}`;
        if (extra.maxUsed != null) tooltip += `\nMax: ${formatBytes(extra.maxUsed)}`;
    }
    bar.element.title = tooltip;
}

function handleUIChange(value, id) {
    const className = UI_CLEANUP_MAP[id];
    if (className) document.body.classList.toggle(className, !!value);
}

// Websocket Listener for resource data
api.addEventListener(WS_EVENT, (event) => {
    const data = event?.detail;
    if (!data || !bars.cpu || !bars.ram) return;
    const diskPercent = (data.disk_path && data.disk_path !== "none") ? data.disk_used_percent : -1;
    updateMonitorBar(bars.disk, diskLabel, diskPercent, "%", { used: data.disk_used, total: data.disk_total });
    updateMonitorBar(bars.cpu, "CPU", enabled.cpu ? data.cpu_utilization : -1);
    updateMonitorBar(bars.ram, "RAM", enabled.ram ? data.ram_used_percent : -1, "%", { used: data.ram_used, total: data.ram_total });
    if (Array.isArray(data.gpus)) {
        data.gpus.forEach((gpu, i) => {
            const suffix = data.gpus.length > 1 ? ` ${i}` : "";
            const ge = gpuEnabled[i] || { gpu: true, vram: true, temp: true };
            if (bars[`gpu_${i}`]) updateMonitorBar(bars[`gpu_${i}`], `GPU${suffix}`, ge.gpu ? gpu.gpu_utilization : -1);
            if (bars[`vram_${i}`]) {
                if (gpu.vram_used > (maxVramUsed[i] || 0)) maxVramUsed[i] = gpu.vram_used;
                updateMonitorBar(bars[`vram_${i}`], `VRAM${suffix}`, ge.vram ? gpu.vram_used_percent : -1, "%", { used: gpu.vram_used, total: gpu.vram_total, maxUsed: maxVramUsed[i] });
            }
            if (bars[`temp_${i}`]) {
                const temp = gpu.gpu_temperature;
                const tempBar = bars[`temp_${i}`];
                if (!ge.temp) { updateMonitorBar(tempBar, `Temp${suffix}`, -1); } 
                else {
                    if (temp >= 0) {
                        const ratio = Math.min(100, Math.max(0, temp));
                        tempBar.slider.style.background = `color-mix(in srgb, #ff0000 ${ratio}%, #00ff00)`;
                        tempBar.valueEl.textContent = `${Math.round(temp)}\u00B0`;
                    }
                    updateMonitorBar(tempBar, `Temp${suffix}`, temp >= 0 ? Math.min(temp, 100) : -1, "\u00B0");
                }
            }
        });
    }
});

app.registerExtension({
    name: EXTENSION_NAME,
    async setup() {
        loadStylesheet();
		
        const root = document.createElement("div");
        root.id = "sys-monitor-root";		
		
        timerEl = document.createElement("div");
        timerEl.id = "comfy-elapsed-timer";
        timerEl.textContent = "⏱ 0:00:000";
		
		// --- Actionbar Move Setup ---
        const moveActionbarEnabled = app.ui.settings.getSettingValue("MagicTools.UI.MoveActionbar", true);
        const ACTION_TARGET = ".workflow-tabs-container > div > .flex.h-full.shrink-0.items-center";
        const BAR_SELECTOR = ".actionbar-container";

        const performMove = (el) => {
            const tabs = document.querySelector(ACTION_TARGET);
            if (!tabs || !el || tabs.contains(el)) return;
            document.querySelectorAll(BAR_SELECTOR).forEach(node => { if (node !== el) node.remove(); });
            el.style.cssText = "border:none; box-shadow:none; background:transparent; height:auto; padding:0 8px;";
            tabs.appendChild(el);
        };

		function injectTimer() {
            if (!timerEl) return false;
            const panelBtn = document.querySelector('.sys-monitor');
            if (panelBtn) {
                const anchor = panelBtn.previousElementSibling ?? panelBtn;
                anchor.before(timerEl);
                timerEl.style.display = timerVisible ? "flex" : "none";
                const qbg = document.querySelector('.queue-button-group');
                if (qbg) {
                    const cs = getComputedStyle(qbg);
                    timerEl.style.height = cs.height;
                    timerEl.style.padding = "0 10px";
                    timerEl.style.alignItems = "center";
                }
                timerEl.style.fontSize = getComputedStyle(anchor).fontSize;
                return true;
            }
            return false;
        }

		// --- Unified Observer ---
		const uiObserver = new MutationObserver((muts) => {
			// 1. Check if the mutations were just our own timer moving
			// This prevents the infinite recursion loop
			const isTimerMutation = muts.every(m => 
				m.target === timerEl || 
				m.addedNodes[0] === timerEl || 
				m.removedNodes[0] === timerEl
			);
			if (isTimerMutation) return;

			injectTimer();

			if (moveActionbarEnabled) {
				for (const m of muts) {
					for (const node of m.addedNodes) {
						if (node.nodeType !== 1) continue;
						if (node.matches(BAR_SELECTOR)) performMove(node);
						else {
							const found = node.querySelector(BAR_SELECTOR);
							if (found) performMove(found);
						}
					}
				}
			}
		});

		// Use a slightly more restrictive filter if possible, 
		// but at least disconnect/reconnect or check target as above.
		uiObserver.observe(document.body, { childList: true, subtree: true });
        
        // Initial Actionbar Check
        if (moveActionbarEnabled) {
            const existingBar = document.querySelector(BAR_SELECTOR);
            if (existingBar) performMove(existingBar);
        }
		
        BASE_METRICS.forEach(metric => {
            const bar = createMonitorBar(metric.cssClass, metric.label);
            bars[metric.id] = bar;
            root.appendChild(bar.element);
        });

        try {
            const resp = await api.fetchApi(`${API_BASE}/gpu`);
            if (resp.ok) gpuList = await resp.json();
        } catch (e) {}

        gpuList.forEach(gpu => {
            const idx = gpu.index;
            const suffix = gpuList.length > 1 ? ` ${idx}` : "";
            ["gpu", "vram", "temp"].forEach(type => {
                const bar = createMonitorBar(type, `${type.toUpperCase()}${suffix}`);
                bars[`${type}_${idx}`] = bar;
                root.appendChild(bar.element);
            });
            maxVramUsed[idx] = 0;
            gpuEnabled[idx] = { gpu: true, vram: true, temp: true };
        });

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "sys-cleanup-buttons";
        root.appendChild(buttonContainer);

        const createBtn = (id, svg, tooltip, onClick) => {
            const btn = document.createElement("div");
            btn.id = id; btn.className = "sys-btn"; btn.innerHTML = svg; btn.title = tooltip; btn.onclick = onClick;
            return btn;
        };				

        const unloadBtn = createBtn("btn-unload-models", ICON_UNLOAD, "Unload Models", async () => {
            const resp = await api.fetchApi("/free", { method: "POST", body: JSON.stringify({ unload_models: true, free_memory: false }) });
            if (resp.ok) {
                app.extensionManager.toast.add({
                    severity: 'success',
                    title: 'System Monitor',
                    message: 'Clearing Models!',
					detail: 'Clearing Models!',
					styleClass: 'mt-toast-top-right',
                    life: 3000
                });
            }
        });

        const freeBtn = createBtn("btn-free-memory", ICON_BRUSH, "Free Memory", async () => {
            const resp = await api.fetchApi("/free", { method: "POST", body: JSON.stringify({ unload_models: false, free_memory: true }) });
            if (resp.ok) {
                app.extensionManager.toast.add({
                    severity: 'success',
                    title: 'System Monitor',
                    message: 'Clearing Memory!',
					detail: 'Clearing Memory!',
					styleClass: 'mt-toast-top-right',
                    life: 3000
                });
            }
        });		

		const managerBtn = createBtn("btn-open-manager", ICON_MANAGER, "Extension Manager", () => {
			const nativeIcon = document.querySelector('i.icon-\\[comfy--extensions-blocks\\]');
			const nativeBtn = nativeIcon?.closest('button');
			
			if (nativeBtn) {
				nativeBtn.click();
			} else {
				// Fallback for older versions or different menu states
				const fallbackBtn = document.getElementById("comfy-manage-extensions-btn") || 
									document.querySelector('button[title="Manage Extensions"]');
				if (fallbackBtn) fallbackBtn.click();
			}
		});	

		const settingsBtn = document.createElement("div");
		settingsBtn.id = "btn-settings";
		settingsBtn.className = "sys-btn";
		settingsBtn.innerHTML = ICON_SETTINGS;
		settingsBtn.title = "ComfyUI Settings";
		settingsBtn.style.pointerEvents = "auto";
		settingsBtn.style.cursor = "pointer";
		settingsBtn.addEventListener("click", (e) => {
			e.preventDefault(); e.stopPropagation();
			if (app.canvas?.showSettings) { app.canvas.showSettings(); return; }
			const settingsEl = document.getElementById("comfy-settings-btn") || document.querySelector(".comfy-settings-btn") || document.querySelector('button[title="Settings"]');
			if (settingsEl) { settingsEl.click(); } 
            else { try { app.ui.settings.show(); } catch (err) { console.error("MagicTools: Settings failed."); } }
		}, true);

		const restartBtn = createBtn("btn-restart-comfyui", ICON_RESTART, "Restart ComfyUI", async () => {
			if (confirm("Are you sure you want to restart ComfyUI?")) {
				// We use both message and detail for maximum compatibility
				app.extensionManager.toast.add({
					severity: 'warn',
					title: 'System Monitor',
					message: 'Restarting server...',
					detail: 'ComfyUI is restarting. Please wait...',
					styleClass: 'mt-toast-top-right',
					life: 10000
				});
				
				try {
					const resp = await api.fetchApi("/magictools/restart", { method: "POST" });
					if (!resp.ok) throw new Error();
				} catch (e) {
					app.extensionManager.toast.add({
						severity: 'error',
						title: 'Restart Failed',
						detail: 'Could not contact the server.'
					});
					return;
				}

				const pollServer = async () => {
					try {
						const resp = await fetch(window.location.href, { cache: "no-store" });
						if (resp.ok) {
							app.extensionManager.toast.add({
								severity: 'success',
								title: 'Server Online',
								detail: 'ComfyUI Online. Please refresh your browser!',
								styleClass: 'mt-toast-top-right',
								life: 15000
							});
						} else { 
							setTimeout(pollServer, 1500); 
						}
					} catch (err) { 
						setTimeout(pollServer, 1500); 
					}
				};
				setTimeout(pollServer, 3000);
			}
		});	

		const applyInitialVisibility = () => {// Add this line so it respects the same toggle as the native menu
			unloadBtn.style.display = app.ui.settings.getSettingValue("MagicTools.Buttons.ShowUnloadBtn", true) ? "flex" : "none";
			freeBtn.style.display = app.ui.settings.getSettingValue("MagicTools.Buttons.ShowFreeBtn", true) ? "flex" : "none";
			managerBtn.style.display = app.ui.settings.getSettingValue("MagicTools.UI.ShowManagerBtn", true) ? "flex" : "none";
			settingsBtn.style.display = app.ui.settings.getSettingValue("MagicTools.Buttons.ShowSettingsBtn", true) ? "flex" : "none";
			restartBtn.style.display = app.ui.settings.getSettingValue("MagicTools.Buttons.ShowRestartBtn", true) ? "flex" : "none";
		};
		applyInitialVisibility();

        buttonContainer.appendChild(unloadBtn);
        buttonContainer.appendChild(freeBtn);
        buttonContainer.appendChild(managerBtn);
        buttonContainer.appendChild(settingsBtn);
        buttonContainer.appendChild(restartBtn);

        const positionMonitor = () => {
            const target = app.menu?.settingsGroup?.element || document.getElementById("queue-button");
            if (target?.parentElement) target.parentElement.insertBefore(root, target.nextSibling);
            else document.body.appendChild(root);
        };

        positionMonitor();
        api.addEventListener("Comfy.UseNewMenu", positionMonitor);		
		
		// Timer
        api.addEventListener("execution_start", () => { resetTimer(); startTimer(); });
        api.addEventListener("execution_success", () => stopTimer(false));
        api.addEventListener("execution_error", () => stopTimer('cancel'));
        api.addEventListener("execution_interrupted", () => stopTimer('cancel'));
		
		// Image Compare
        api.addEventListener("mt.image_compare_preview", (event) => {
            if (event.detail && event.detail.isSkipping) return; 
            stopTimer(true);
        });

        const originalFetch = window.fetch;
        window.fetch = function() {
            const url = typeof arguments[0] === 'string' ? arguments[0] : '';
            if (url.includes('/image_compare_pause/continue/')) {
                startTimer();
            } else if (url.includes('/image_compare_pause/cancel')) {
                stopTimer('cancel'); 
            }
            return originalFetch.apply(this, arguments);
        };

		// Disk
        let partitions = ["none", "/"];
        try {
            const resp = await api.fetchApi(`${API_BASE}/disk`);
            if (resp.ok) partitions = await resp.json();
        } catch (e) {}
        const defaultDisk = partitions.find((p) => p !== "none") || "none";
        const getDiskLabel = (path) => {
            if (!path || path === "none") return "Disk";
            if (/^[A-Z]:\\?$/i.test(path.replace(/\\$/, ""))) return `Disk ${path[0]}:`;
            return path === "/" ? "Disk /" : `Disk ${path.length > 8 ? "..." + path.slice(-7) : path}`;
        };
        diskLabel = getDiskLabel(defaultDisk);

		// Settings
		app.ui.settings.addSetting({ 
		id: "MagicTools.Actionbar", 
		name: `Version ${VERSION}`, 
            type: () => {
                const x = document.createElement('span')
                const a = document.createElement('a')
                a.innerText = "Report issues or request features"
                a.href = "https://github.com/mike420/ComfyUI_Actionbar/issues"
                a.target = "_blank"
                a.style.paddingRight = "12px"
                x.appendChild(a)
                return x
            },
		});			

        Object.entries(UI_CLEANUP_MAP).forEach(([settingId, className]) => {
            app.ui.settings.addSetting({
                id: settingId,
                name: settingId.split('.').pop(),
                type: "boolean",
                default: settingId.includes("Triangle"),
                onChange: (v) => handleUIChange(v, settingId)
            });
            handleUIChange(app.ui.settings.getSettingValue(settingId), settingId);
        });

		app.ui.settings.addSetting({ 
            id: "MagicTools.UI.MoveActionbar", 
            name: "Move actionbar to top bar", 
            type: "boolean", 
            defaultValue: true, 
            onChange: (newVal) => { 
                const current = app.ui.settings.getSettingValue("MagicTools.UI.MoveActionbar"); 
                if (current !== undefined && newVal !== current) showRefreshPrompt(); 
            } 
        });

		app.ui.settings.addSetting({ id: "MagicTools.Timer.ShowTimer", name: "Show Execution Timer", type: "boolean", defaultValue: true, onChange: (value) => { timerVisible = value; if (timerEl) { timerEl.style.display = value ? "flex" : "none"; }} });
		
		app.ui.settings.addSetting({ id: "MagicTools.Buttons.ShowRestartBtn", name: "Show Restart Button", type: "boolean", defaultValue: true, onChange: (v) => { if (restartBtn) restartBtn.style.display = v ? "flex" : "none"; } });
		app.ui.settings.addSetting({ id: "MagicTools.Buttons.ShowManagerBtn", name: "Show Extensions Button", type: "boolean", defaultValue: true, onChange: (v) => { if (managerBtn) managerBtn.style.display = v ? "flex" : "none"; } });		
		app.ui.settings.addSetting({ id: "MagicTools.Buttons.ShowSettingsBtn", name: "Show Settings Button", type: "boolean", defaultValue: true, onChange: (v) => { if (settingsBtn) settingsBtn.style.display = v ? "flex" : "none"; } });
		
        app.ui.settings.addSetting({ id: "MagicTools.Buttons.ShowFreeBtn", name: "Show Free Memory Button", type: "boolean", defaultValue: true, onChange: (v) => { if (freeBtn) freeBtn.style.display = v ? "flex" : "none"; } });
        app.ui.settings.addSetting({ id: "MagicTools.Buttons.ShowUnloadBtn", name: "Show Unload Models Button", type: "boolean", defaultValue: true, onChange: (v) => { if (unloadBtn) unloadBtn.style.display = v ? "flex" : "none"; } });
		
        app.ui.settings.addSetting({ id: "MagicTools.Monitor.WhichDisk", name: "Disk partition", type: "combo", defaultValue: defaultDisk, options: partitions, onChange: async (v) => { diskLabel = getDiskLabel(v); if (v === "none") updateMonitorBar(bars.disk, diskLabel, -1); try { await api.fetchApi(`${API_BASE}`, { method: "PATCH", body: JSON.stringify({ whichDisk: v }) }); } catch (e) {} } });

        gpuList.slice().reverse().forEach((gpu) => {
            const idx = gpu.index;
            const suffix = gpuList.length > 1 ? ` ${idx}` : "";
            app.ui.settings.addSetting({ id: `MagicTools.Monitor.ShowTemp${idx}`, name: `Show Temperature${suffix}`, type: "boolean", defaultValue: true, onChange: async (v) => { gpuEnabled[idx].temp = v; if (!v && bars[`temp_${idx}`]) updateMonitorBar(bars[`temp_${idx}`], `Temp${suffix}`, -1); try { await api.fetchApi(`${API_BASE}/gpu/${idx}`, { method: "PATCH", body: JSON.stringify({ temperature: v }) }); } catch (e) {} } });
            app.ui.settings.addSetting({ id: `MagicTools.Monitor.ShowVram${idx}`, name: `Show VRAM${suffix}`, type: "boolean", defaultValue: true, onChange: async (v) => { gpuEnabled[idx].vram = v; if (!v && bars[`vram_${idx}`]) updateMonitorBar(bars[`vram_${idx}`], `VRAM${suffix}`, -1); try { await api.fetchApi(`${API_BASE}/gpu/${idx}`, { method: "PATCH", body: JSON.stringify({ vram: v }) }); } catch (e) {} } });
            app.ui.settings.addSetting({ id: `MagicTools.Monitor.ShowGpu${idx}`, name: `Show GPU${suffix}`, type: "boolean", defaultValue: true, onChange: async (v) => { gpuEnabled[idx].gpu = v; if (!v && bars[`gpu_${idx}`]) updateMonitorBar(bars[`gpu_${idx}`], `GPU${suffix}`, -1); try { await api.fetchApi(`${API_BASE}/gpu/${idx}`, { method: "PATCH", body: JSON.stringify({ utilization: v }) }); } catch (e) {} } });
        });

        app.ui.settings.addSetting({ id: "MagicTools.Monitor.ShowRam", name: "Show RAM", type: "boolean", defaultValue: true, onChange: async (v) => { enabled.ram = v; if (!v) updateMonitorBar(bars.ram, "RAM", -1); try { await api.fetchApi(`${API_BASE}`, { method: "PATCH", body: JSON.stringify({ switchRAM: v }) }); } catch (e) {} } });
        app.ui.settings.addSetting({ id: "MagicTools.Monitor.ShowCpu", name: "Show CPU", type: "boolean", defaultValue: true, onChange: async (v) => { enabled.cpu = v; if (!v) updateMonitorBar(bars.cpu, "CPU", -1); try { await api.fetchApi(`${API_BASE}`, { method: "PATCH", body: JSON.stringify({ switchCPU: v }) }); } catch (e) {} } });
        app.ui.settings.addSetting({ id: "MagicTools.Monitor.Rate", name: "Update Rate", type: "slider", defaultValue: 1, attrs: { min: 0.5, max: 10, step: 0.5 }, onChange: async (v) => { try { await api.fetchApi(`${API_BASE}`, { method: "PATCH", body: JSON.stringify({ rate: v }) }); } catch (e) {} } });
    }
});