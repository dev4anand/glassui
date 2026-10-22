(function (root, factory) {
    if (typeof define === "function" && define.amd) define([], factory);
    else if (typeof module === "object" && module.exports) module.exports = factory();
    else root.Glass = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const script = document.currentScript;
    const DEFAULT_SELECTOR =
        (script && script.getAttribute("data-glass-selector")) ||
        ".glass, [data-glass], [glass-edge]";
    const DEFAULT_REFRACTION = 0.38;
    const DEFAULT_EDGE = 0.20;

    const sourceCanvas = document.createElement("canvas");
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const elements = new Set();

    let selector = DEFAULT_SELECTOR;
    let backgroundImage = null;
    let backgroundPixels = null;
    let screenCanvas = null;
    let screenContext = null;
    let observer = null;
    let resizeBound = false;
    let defaultRefraction = DEFAULT_REFRACTION;
    let defaultEdge = DEFAULT_EDGE;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function parseNumber(value, fallback) {
        const number = Number.parseFloat(value);
        return Number.isFinite(number) ? number : fallback;
    }

    // glass-edge is the fraction of the lens used for stretching: 0.2 or "20%".
    // Larger values make the stretched band wider.
    function parseEdge(value, fallback = DEFAULT_EDGE) {
        if (value == null || String(value).trim() === "") return fallback;
        const text = String(value).trim();
        let edge = parseNumber(text, fallback);
        if (text.endsWith("%") || (!text.endsWith("%") && edge > 1)) edge /= 100;
        return clamp(edge, 0.01, 0.95);
    }

    function imageReady(image) {
        return image && image.tagName === "IMG" &&
            image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    }

    function findBackgroundImage() {
        if (backgroundImage) return backgroundImage;

        const candidates = [
            document.querySelector("img[data-glass-background]"),
            document.getElementById("wallpaper"),
            document.querySelector("img.glass-wallpaper"),
            document.querySelector("img[src*='wallpaper']"),
            document.querySelector("img")
        ];
        backgroundImage = candidates.find((image) => image && image.tagName === "IMG") || null;
        return backgroundImage;
    }

    function resizeBackground() {
        const image = findBackgroundImage();
        if (!image) return;

        if (!imageReady(image)) {
            image.addEventListener("load", resizeBackground, { once: true });
            return;
        }

        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;

        sourceCanvas.width = width;
        sourceCanvas.height = height;
        sourceContext.clearRect(0, 0, width, height);
        sourceContext.drawImage(
            image,
            (width - drawWidth) / 2,
            (height - drawHeight) / 2,
            drawWidth,
            drawHeight
        );

        screenCanvas = screenCanvas || document.getElementById("screen") ||
            document.querySelector("canvas.screen");
        if (screenCanvas) {
            screenCanvas.width = width;
            screenCanvas.height = height;
            screenContext = screenContext || screenCanvas.getContext("2d");
            if (screenContext) screenContext.drawImage(sourceCanvas, 0, 0);
        }

        try {
            backgroundPixels = sourceContext.getImageData(0, 0, width, height);
        } catch (error) {
            backgroundPixels = null;
            console.error(
                "GlassUI needs a same-origin background image or an image with CORS access.",
                error
            );
            return;
        }

        renderAll();
    }

    function getEdge(element, style) {
        if (element.hasAttribute("glass-edge")) {
            return parseEdge(element.getAttribute("glass-edge"));
        }

        const cssEdge = style.getPropertyValue("--glass-edge").trim();
        if (cssEdge) return parseEdge(cssEdge);

        // Backwards compatibility with the earlier distortion-start variable.
        const oldStart = style.getPropertyValue("--glass-distortion-start").trim();
        if (oldStart) return clamp(1 - parseNumber(oldStart, 1 - DEFAULT_EDGE), 0.01, 0.95);

        return defaultEdge;
    }

    function render(element) {
        if (!element || !element._glassCanvas || !backgroundPixels) return;

        const rect = element.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width < 1 || height < 1) return;

        const canvas = element._glassCanvas;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const context = canvas.getContext("2d");
        if (!context) return;

        const frame = context.createImageData(width, height);
        const output = frame.data;
        const input = backgroundPixels.data;
        const backgroundWidth = backgroundPixels.width;
        const backgroundHeight = backgroundPixels.height;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const bendScale = Math.min(halfWidth, halfHeight);
        const centerX = rect.left + halfWidth;
        const centerY = rect.top + halfHeight;
        const style = getComputedStyle(element);

        const refraction = Math.max(
            0,
            parseNumber(style.getPropertyValue("--glass-refraction"), defaultRefraction)
        );
        const edge = getEdge(element, style);
        const shape = (
            element.getAttribute("glass-shape") ||
            style.getPropertyValue("--glass-shape") ||
            ""
        ).trim().toLowerCase();
        const radius = parseNumber(style.borderTopLeftRadius, 0);
        const isCircle = shape === "circle" ||
            (Math.abs(width - height) < 1 && radius >= Math.min(width, height) / 2 - 1);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dx = x - halfWidth;
                const dy = y - halfHeight;
                const nx = Math.abs(dx) / halfWidth;
                const ny = Math.abs(dy) / halfHeight;
                const normalized = isCircle
                    ? Math.min(1, Math.sqrt(nx * nx + ny * ny))
                    : Math.max(nx, ny);

                const progress = clamp((normalized - (1 - edge)) / edge, 0, 1);
                const smooth = progress * progress * (3 - 2 * progress);
                const bend = smooth * smooth * refraction * bendScale;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const dirX = distance > 0.001 ? dx / distance : 0;
                const dirY = distance > 0.001 ? dy / distance : 0;

                const sx = clamp(centerX + dx + dirX * bend, 0, backgroundWidth - 1.001);
                const sy = clamp(centerY + dy + dirY * bend, 0, backgroundHeight - 1.001);
                const x0 = Math.floor(sx);
                const y0 = Math.floor(sy);
                const x1 = Math.min(x0 + 1, backgroundWidth - 1);
                const y1 = Math.min(y0 + 1, backgroundHeight - 1);
                const fx = sx - x0;
                const fy = sy - y0;
                const p00 = (y0 * backgroundWidth + x0) * 4;
                const p10 = (y0 * backgroundWidth + x1) * 4;
                const p01 = (y1 * backgroundWidth + x0) * 4;
                const p11 = (y1 * backgroundWidth + x1) * 4;
                const index = (y * width + x) * 4;

                for (let channel = 0; channel < 3; channel++) {
                    const top = input[p00 + channel] * (1 - fx) +
                        input[p10 + channel] * fx;
                    const bottom = input[p01 + channel] * (1 - fx) +
                        input[p11 + channel] * fx;
                    output[index + channel] = top * (1 - fy) + bottom * fy;
                }
                output[index + 3] = 255;
            }
        }

        context.putImageData(frame, 0, 0);
    }

    function renderAll() {
        for (const element of elements) {
            if (document.documentElement.contains(element)) render(element);
            else detach(element);
        }
    }

    function matches(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        try {
            return element.matches(selector);
        } catch (error) {
            console.error("GlassUI: invalid selector:", selector, error);
            return false;
        }
    }

    function attach(element) {
        if (!element || element._glassAttached) return;

        if (!element.classList.contains("glass")) {
            element.classList.add("glass");
            element._glassClassAdded = true;
        } else {
            element._glassClassAdded = false;
        }

        let canvas = Array.from(element.children).find((child) =>
            child.classList && child.classList.contains("glass-canvas")
        );
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.className = "glass-canvas";
            canvas.setAttribute("aria-hidden", "true");
            element.prepend(canvas);
        }

        element._glassCanvas = canvas;
        element._glassAttached = true;
        elements.add(element);
        render(element);
    }

    function detach(element) {
        if (!element || !element._glassAttached) return;
        elements.delete(element);
        element._glassAttached = false;
        if (element._glassCanvas) element._glassCanvas.remove();
        element._glassCanvas = null;

        if (element._glassClassAdded) {
            element.classList.remove("glass");
            element._glassClassAdded = false;
        }
    }

    function scan(rootNode = document) {
        if (rootNode.nodeType === Node.ELEMENT_NODE && matches(rootNode)) attach(rootNode);
        if (!rootNode.querySelectorAll) return;
        try {
            rootNode.querySelectorAll(selector).forEach(attach);
        } catch (error) {
            console.error("GlassUI: invalid selector:", selector, error);
        }
    }

    function observeDOM() {
        if (observer || typeof MutationObserver === "undefined") return;

        observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
                    });
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        elements.forEach((element) => {
                            if (element === node || node.contains(element)) detach(element);
                        });
                    });
                    continue;
                }

                const element = mutation.target;
                if (matches(element)) attach(element);
                else detach(element);

                if (element._glassAttached) render(element);
            }
        });

        observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class", "id", "data-glass", "glass-edge", "glass-shape"]
        });
    }

    function init(options = {}) {
        if (options.selector) {
            selector = String(options.selector);
            Array.from(elements).forEach((element) => {
                if (!matches(element)) detach(element);
            });
        }

        observeDOM();
        scan();
        resizeBackground();

        if (!resizeBound) {
            window.addEventListener("resize", resizeBackground);
            resizeBound = true;
        }
    }

    function create(options = {}) {
        const element = document.createElement(options.tag || "div");
        element.className = ["glass", options.className || ""].join(" ").trim();
        element.style.position = options.position || "fixed";
        element.style.zIndex = String(options.zIndex ?? 10);

        if (options.id) element.id = options.id;
        if (options.size) {
            element.style.width = typeof options.size === "number" ? options.size + "px" : options.size;
            element.style.height = typeof options.size === "number" ? options.size + "px" : options.size;
        } else {
            if (options.width) element.style.width = typeof options.width === "number" ? options.width + "px" : options.width;
            if (options.height) element.style.height = typeof options.height === "number" ? options.height + "px" : options.height;
        }
        if (options.borderRadius) element.style.borderRadius = options.borderRadius;
        if (options.edge !== undefined) element.setAttribute("glass-edge", String(options.edge));
        if (options.x !== undefined) element.style.left = typeof options.x === "number" ? options.x + "px" : options.x;
        if (options.y !== undefined) element.style.top = typeof options.y === "number" ? options.y + "px" : options.y;

        (options.parent || document.body).appendChild(element);
        return element;
    }

    function setBackground(source) {
        if (typeof source === "string") {
            try {
                backgroundImage = document.querySelector(source);
            } catch (error) {
                console.error("GlassUI: invalid background selector:", source, error);
                return;
            }
        } else {
            backgroundImage = source;
        }
        resizeBackground();
    }

    function setEdge(value) {
        defaultEdge = parseEdge(value);
        renderAll();
    }

    function setDistortionStart(value) {
        defaultEdge = 1 - clamp(parseNumber(value, 1 - DEFAULT_EDGE), 0.01, 0.99);
        renderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => init(), { once: true });
    } else {
        init();
    }

    return {
        init,
        attach,
        detach,
        render,
        renderAll,
        resize: resizeBackground,
        create,
        setBackground,
        setSelector: (value) => init({ selector: value }),
        setRefraction: (value) => {
            defaultRefraction = Math.max(0, parseNumber(value, DEFAULT_REFRACTION));
            renderAll();
        },
        setEdge,
        setDistortionStart
    };
}));
