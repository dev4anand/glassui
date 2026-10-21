/*
 * ====================================================================
 * GENERIC LIQUID GLASS ENGINE (glass.js)
 * ====================================================================
 *
 * Quick start:
 *   1. Include glass.css and glass.js.
 *   2. Add class="glass" to any div, section, card, or other container.
 *   3. Provide a background image with <img data-glass-background ...>
 *      (or call Glass.setBackground(imageElement)) for the refraction source.
 *
 * By default, .glass elements receive the effect automatically, including
 * elements added dynamically. For ID/custom-class targets, set a selector
 * on the script tag:
 *   <script src="glass.js" data-glass-selector=".glass, #hero-panel"></script>
 * Matching custom targets automatically receive the "glass" styling class.
 *
 * Per-element CSS variables (set on that element or via its ID/class):
 *   --glass-refraction: 0.38;
 *   --glass-distortion-start: 0.8;  lower value = wider stretched edge band
 *   --glass-shape: circle;          radial distortion for a circular lens
 *
 * Positioning, sizing, border-radius, and dragging are intentionally left
 * to the consuming page. This keeps the engine reusable in any layout.
 * ====================================================================
 */

(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.Glass = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const DEFAULT_SELECTOR = ".glass, [data-glass]";
    const scriptElement = document.currentScript;
    let glassSelector =
        (scriptElement && scriptElement.getAttribute("data-glass-selector")) ||
        DEFAULT_SELECTOR;

    let REFRACTION = 0.38;
    let DISTORTION_START = 0.8;

    const baseCanvas = document.createElement("canvas");
    const baseCtx = baseCanvas.getContext("2d", { willReadFrequently: true });

    let backgroundPixels = null;
    let backgroundImage = null;
    let screenCanvas = null;
    let screenCtx = null;
    let domObserver = null;
    let resizeListenerInstalled = false;

    const attachedElements = new Set();

    function isUsableImage(image) {
        return !!image &&
            image.tagName === "IMG" &&
            image.complete &&
            image.naturalWidth > 0 &&
            image.naturalHeight > 0;
    }

    /*
     * Resolve an explicit background image first. The fallback choices keep
     * existing demos that use #wallpaper / images whose src contains
     * "wallpaper" working without changes.
     */
    function findBackgroundImage() {
        if (isUsableImage(backgroundImage)) {
            return backgroundImage;
        }

        const explicit =
            document.querySelector("img[data-glass-background]") ||
            document.getElementById("wallpaper") ||
            document.querySelector("img.glass-wallpaper") ||
            document.querySelector("img[src*='wallpaper']");

        if (explicit && explicit.tagName === "IMG") {
            backgroundImage = explicit;
            return explicit;
        }

        const anyImg = document.querySelector("img");
        if (anyImg && anyImg.tagName === "IMG") {
            backgroundImage = anyImg;
            return anyImg;
        }

        return null;
    }

    function findScreenCanvas() {
        if (!screenCanvas) {
            screenCanvas =
                document.getElementById("screen") ||
                document.querySelector("canvas.screen");
            if (screenCanvas) {
                screenCtx = screenCanvas.getContext("2d");
            }
        }
        return screenCanvas;
    }

    /*
     * Use the source image as a viewport-sized cover image, capture its pixels,
     * and optionally paint the same image into the demo's visible #screen canvas.
     */
    function resizeBackground() {
        const image = findBackgroundImage();
        if (!isUsableImage(image) || !baseCtx) {
            return;
        }

        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);

        findScreenCanvas();
        if (screenCanvas) {
            screenCanvas.width = width;
            screenCanvas.height = height;
        }

        baseCanvas.width = width;
        baseCanvas.height = height;

        const imgW = image.naturalWidth;
        const imgH = image.naturalHeight;
        const scale = Math.max(width / imgW, height / imgH);
        const drawWidth = imgW * scale;
        const drawHeight = imgH * scale;
        const drawX = (width - drawWidth) / 2;
        const drawY = (height - drawHeight) / 2;

        baseCtx.clearRect(0, 0, width, height);
        baseCtx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

        if (screenCanvas && screenCtx) {
            screenCtx.clearRect(0, 0, width, height);
            screenCtx.drawImage(baseCanvas, 0, 0);
        }

        try {
            backgroundPixels = baseCtx.getImageData(0, 0, width, height);
        } catch (error) {
            // A cross-origin image without CORS permission cannot be sampled.
            backgroundPixels = null;
            console.error(
                "GlassUI could not read the background pixels. For remote images, " +
                "serve the image from the same origin or enable suitable CORS headers.",
                error
            );
            return;
        }

        renderAll();
    }

    function readCssNumber(element, property, fallback) {
        const raw = window.getComputedStyle(element).getPropertyValue(property).trim();
        if (!raw) return fallback;

        const value = Number.parseFloat(raw);
        return Number.isFinite(value) ? value : fallback;
    }

    function readCssString(element, property, fallback) {
        const value = window.getComputedStyle(element).getPropertyValue(property).trim();
        return value || fallback;
    }

    /*
     * Render a lens into its own canvas.
     *
     * Rectangular elements use the original per-axis edge falloff. Elements
     * with --glass-shape: circle use radial distance so the stretch band follows
     * the circular boundary instead of looking square beneath the round clip.
     */
    function renderLens(element) {
        if (!element || !element._glassCanvas || !backgroundPixels) {
            return;
        }

        const rect = element.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width < 1 || height < 1) return;

        const canvas = element._glassCanvas;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const lensImage = ctx.createImageData(width, height);
        const output = lensImage.data;
        const input = backgroundPixels.data;
        const bgW = backgroundPixels.width;
        const bgH = backgroundPixels.height;

        const halfW = width / 2;
        const halfH = height / 2;
        const bendScale = Math.min(halfW, halfH);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const elementRefraction = Math.max(
            0,
            readCssNumber(element, "--glass-refraction", REFRACTION)
        );
        const rawStart = readCssNumber(
            element,
            "--glass-distortion-start",
            DISTORTION_START
        );
        const distortionStart = Math.min(0.98, Math.max(0, rawStart));
        const isCircle = readCssString(element, "--glass-shape", "rect") === "circle";

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dx = x - halfW;
                const dy = y - halfH;
                const nx = Math.abs(dx) / halfW;
                const ny = Math.abs(dy) / halfH;

                // Circle: stretch band follows the true circular perimeter.
                // Rectangle: retain the existing square/rectangle behavior.
                const normalized = isCircle
                    ? Math.min(1, Math.sqrt(nx * nx + ny * ny))
                    : Math.max(nx, ny);

                const progress = Math.max(
                    0,
                    (normalized - distortionStart) / (1 - distortionStart)
                );
                const smooth = progress * progress * (3 - 2 * progress);
                const bend = smooth * smooth * elementRefraction * bendScale;

                const distance = Math.sqrt(dx * dx + dy * dy);
                const dirX = distance > 0.001 ? dx / distance : 0;
                const dirY = distance > 0.001 ? dy / distance : 0;

                let sx = centerX + dx + dirX * bend;
                let sy = centerY + dy + dirY * bend;

                sx = Math.max(0, Math.min(bgW - 1.001, sx));
                sy = Math.max(0, Math.min(bgH - 1.001, sy));

                const x0 = Math.floor(sx);
                const y0 = Math.floor(sy);
                const x1 = Math.min(x0 + 1, bgW - 1);
                const y1 = Math.min(y0 + 1, bgH - 1);
                const fx = sx - x0;
                const fy = sy - y0;

                const p00 = (y0 * bgW + x0) * 4;
                const p10 = (y0 * bgW + x1) * 4;
                const p01 = (y1 * bgW + x0) * 4;
                const p11 = (y1 * bgW + x1) * 4;
                const outIdx = (y * width + x) * 4;

                for (let channel = 0; channel < 3; channel++) {
                    const top = input[p00 + channel] * (1 - fx) +
                        input[p10 + channel] * fx;
                    const bottom = input[p01 + channel] * (1 - fx) +
                        input[p11 + channel] * fx;
                    output[outIdx + channel] = top * (1 - fy) + bottom * fy;
                }

                // The edge and canvas clipping come from the element's CSS shape.
                output[outIdx + 3] = 255;
            }
        }

        ctx.putImageData(lensImage, 0, 0);
    }

    function renderAll() {
        for (const element of attachedElements) {
            if (document.documentElement.contains(element)) {
                renderLens(element);
            } else {
                detachGlass(element);
            }
        }
    }

    function matchesGlassSelector(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        try {
            return element.matches(glassSelector);
        } catch (error) {
            console.error("GlassUI: invalid data-glass-selector:", glassSelector, error);
            return false;
        }
    }

    function attachGlass(element) {
        if (!element || element._glassAttached) return;

        // Custom ID/class selectors can be used without manually adding .glass.
        if (!element.classList.contains("glass")) {
            element.classList.add("glass");
            element._glassAddedClass = true;
        } else {
            element._glassAddedClass = false;
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
        attachedElements.add(element);

        if (backgroundPixels) {
            renderLens(element);
        }
    }

    function detachGlass(element) {
        if (!element || !element._glassAttached) return;

        attachedElements.delete(element);
        element._glassAttached = false;

        if (element._glassCanvas) {
            element._glassCanvas.remove();
            element._glassCanvas = null;
        }

        if (element._glassAddedClass) {
            element.classList.remove("glass");
            element._glassAddedClass = false;
        }
    }

    function scanAndAttach(rootNode = document) {
        if (rootNode.nodeType === Node.ELEMENT_NODE && matchesGlassSelector(rootNode)) {
            attachGlass(rootNode);
        }

        if (rootNode.querySelectorAll) {
            let elements;
            try {
                elements = rootNode.querySelectorAll(glassSelector);
            } catch (error) {
                console.error("GlassUI: invalid data-glass-selector:", glassSelector, error);
                return;
            }
            for (let i = 0; i < elements.length; i++) {
                attachGlass(elements[i]);
            }
        }
    }

    function setupObserver() {
        if (domObserver || typeof MutationObserver === "undefined") return;

        domObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            scanAndAttach(node);
                        }
                    }

                    for (const node of mutation.removedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        for (const element of Array.from(attachedElements)) {
                            if (element === node || node.contains(element)) {
                                detachGlass(element);
                            }
                        }
                    }
                } else if (
                    mutation.type === "attributes" &&
                    ["class", "id", "data-glass"].includes(mutation.attributeName)
                ) {
                    const target = mutation.target;
                    if (matchesGlassSelector(target)) {
                        attachGlass(target);
                    } else if (target._glassAttached) {
                        detachGlass(target);
                    }
                }
            }
        });

        domObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "id", "data-glass"]
        });
    }

    /*
     * Backwards-compatible helper: create() still creates a positioned,
     * movable overlay by default. Ordinary .glass elements are layout-neutral.
     */
    function createGlass(options = {}) {
        const div = document.createElement("div");
        div.className = "glass";
        div.style.position = options.position || "fixed";
        div.style.zIndex = options.zIndex === undefined ? "10" : String(options.zIndex);

        if (options.id) div.id = options.id;
        if (options.className) div.classList.add(...String(options.className).split(/\s+/).filter(Boolean));

        if (options.size) {
            div.style.width = typeof options.size === "number" ? options.size + "px" : options.size;
            div.style.height = typeof options.size === "number" ? options.size + "px" : options.size;
        } else {
            if (options.width) div.style.width = typeof options.width === "number" ? options.width + "px" : options.width;
            if (options.height) div.style.height = typeof options.height === "number" ? options.height + "px" : options.height;
        }

        if (options.x !== undefined) {
            div.style.left = typeof options.x === "number" ? options.x + "px" : options.x;
        }
        if (options.y !== undefined) {
            div.style.top = typeof options.y === "number" ? options.y + "px" : options.y;
        }
        if (options.borderRadius) div.style.borderRadius = options.borderRadius;

        const parent = options.parent || document.body;
        parent.appendChild(div);
        return div;
    }

    function init(options = {}) {
        if (options.selector) {
            glassSelector = String(options.selector);

            for (const element of Array.from(attachedElements)) {
                if (!matchesGlassSelector(element)) {
                    detachGlass(element);
                }
            }
        }

        setupObserver();
        scanAndAttach();

        const image = findBackgroundImage();
        if (image) {
            if (isUsableImage(image)) {
                resizeBackground();
            } else {
                image.addEventListener("load", resizeBackground, { once: true });
                image.addEventListener("error", () => {
                    console.error("GlassUI could not load the selected background image:", image);
                }, { once: true });
            }
        }

        if (!resizeListenerInstalled) {
            window.addEventListener("resize", resizeBackground);
            resizeListenerInstalled = true;
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => init());
    } else {
        init();
    }

    return {
        init,
        attach: attachGlass,
        detach: detachGlass,
        render: renderLens,
        renderAll,
        resize: resizeBackground,
        create: createGlass,
        setBackground: function (source) {
            backgroundImage = typeof source === "string"
                ? document.querySelector(source)
                : source;
            resizeBackground();
        },
        setSelector: function (selector) {
            init({ selector });
        },
        setRefraction: function (value) {
            const parsed = Number(value);
            REFRACTION = Number.isFinite(parsed) ? Math.max(0, parsed) : 0.38;
            renderAll();
        },
        setDistortionStart: function (value) {
            const parsed = Number(value);
            DISTORTION_START = Number.isFinite(parsed)
                ? Math.min(0.98, Math.max(0, parsed))
                : 0.8;
            renderAll();
        }
    };
}));
