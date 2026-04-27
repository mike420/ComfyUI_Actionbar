import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/* ------------------ RESTART ------------------ */

async function handleRestart() {
    if (!confirm("Restart ComfyUI?")) return;

    app.extensionManager.toast.add({
        severity: "warn",
        summary: "System",
        detail: "Restarting server...",
        life: 10000 // Keep it visible until reload
    });

    try {
        // Use standard fetch to avoid ComfyUI's internal error handling wrappers
        await fetch("/magictools/restart", {
            method: "POST"
        });
        
        // If the fetch finishes, we wait for the server to actually reboot
        //setTimeout(() => location.reload(), 5000);
    } catch (e) {
        // In a restart, a 'TypeError: Failed to fetch' is actually a GOOD sign.
        // It means the server closed the connection to reboot.
        console.log("Restarting: Connection closed as expected.");
        //setTimeout(() => location.reload(), 5000);
    }
}

/* ------------------ CANVAS MENU SHIM ------------------ */

function installCanvasMenuFallback() {
    const proto = LGraphCanvas.prototype;

    if (proto.__magictools_patched) return;
    proto.__magictools_patched = true;

    const original = proto.getCanvasMenuOptions;

    proto.getCanvasMenuOptions = function (...args) {
        let options = [];

        if (original) {
            options = original.apply(this, args) || [];
        }

        // Check if item already exists to prevent duplicates
        if (options.find(o => o?.content === "🚨 Restart ComfyUI")) return options;

        //
        options.unshift({
            content: "🚨 Restart ComfyUI",
            callback: handleRestart
        });

        return options;
    };
}

/* ------------------ NODE RELOAD ------------------ */

function reloadNode(node) {
    if (!node?.graph) return;

    const graph = node.graph;
    const type = node.constructor.type;

    const snapshot = {
        pos: [...node.pos],
        size: [...node.size],
        // Store widget data
        widgets: node.widgets?.map(w => ({ name: w.name, value: w.value })) ?? []
    };

    const inputLinks = [];
    const outputLinks = [];

    // Capture incoming connections
    node.inputs?.forEach(input => {
        if (input?.link != null) {
            const link = graph.links[input.link];
            const origin = graph.getNodeById(link?.origin_id);
            if (origin) {
                inputLinks.push([origin, link.origin_slot, input.name]);
            }
        }
    });

    // Capture outgoing connections
    node.outputs?.forEach(output => {
        output?.links?.forEach(id => {
            const link = graph.links[id];
            const target = graph.getNodeById(link?.target_id);
            if (target) {
                outputLinks.push([output.name, target, link.target_slot]);
            }
        });
    });

    graph.remove(node);

    const newNode = LiteGraph.createNode(type);
    graph.add(newNode);

    newNode.pos = snapshot.pos;
    newNode.size = snapshot.size;

    // Restore widget values and trigger their callbacks
    snapshot.widgets.forEach((w) => {
        const targetWidget = newNode.widgets?.find(nw => nw.name === w.name);
        if (targetWidget) {
            targetWidget.value = w.value;
            if (targetWidget.callback) targetWidget.callback(w.value);
        }
    });

    // Reconnect
    inputLinks.forEach(([origin, slot, name]) =>
        origin.connect(slot, newNode, name)
    );

    outputLinks.forEach(([name, target, slot]) =>
        newNode.connect(name, target, slot)
    );
}

/* ------------------ EXTENSION ------------------ */

app.registerExtension({
    name: "MagicTools.MenuExtras",

    setup() {
        if (app.ui?.registerCanvasMenuItem) {
            app.ui.registerCanvasMenuItem({
                id: "magictools.restart",
                label: "🚨 Restart ComfyUI",
                callback: handleRestart,
                order: -100
            });
        } else {
            installCanvasMenuFallback();
        }
    },

    beforeRegisterNodeDef(nodeType) {
        const original = nodeType.prototype.getExtraMenuOptions;

        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            if (original) original.apply(this, arguments);

            options.unshift({
                content: "🔃 Reload Node",
                callback: (_, __, ___, ____, node) => {
                    const canvas = LGraphCanvas.active_canvas;
                    const selected = Object.values(canvas?.selected_nodes || {});

                    (selected.length > 1 ? selected : [node]).forEach(reloadNode);
                }
            });
        };
    }
});