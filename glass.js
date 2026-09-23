/**
 * ====================================================================
 * LIQUID GLASS ENGINE (glass.js)
 * ====================================================================
 * Generic, drop-in glass/lens effect. Grouped under the single class
 * `.glass` - to use in ANY project, just include this file + glass.css,
 * then add class="glass" to any element.
 *
 * Any element with class "glass" automatically gets:
 *  1. An internal refraction canvas that distorts the page's
 *     wallpaper/background image behind it, like liquid glass.
 *  2. A distortion falloff sized to the element's own width/height,
 *     so it works for squares, rectangles, or any border-radius you
 *     give it - whatever you set via inline style or your own CSS.
 *  3. Automatic re-rendering on window resize.
 *  4. MutationObserver support: adding an element with class "glass"
 *     anywhere in the DOM (even dynamically, after page load) works
 *     instantly, with no extra JS calls needed.
 *
 * Positioning is entirely up to your own CSS - this file never moves
 * or drags the element. Whatever position/left/top/transform you give
 * it (inline or in a stylesheet) is exactly where it stays.
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

    /*
     * Default refraction and distortion parameters
     */
    let REFRACTION = 0.38;
    let DISTORTION_START = 0.8;

    /*
     * Offscreen base canvas for viewport-scaled wallpaper pixels
     */
    const baseCanvas = document.createElement("canvas");
    const baseCtx = baseCanvas.getContext("2d", { willReadFrequently: true });

    let backgroundPixels = null;
    let backgroundImage = null;
    let screenCanvas = null;
    let screenCtx = null;

    const attachedElements = new Set();

    /**
     * Locate background image source in DOM
     */
    function findBackgroundImage() {
        if (backgroundImage && backgroundImage.complete && backgroundImage.naturalWidth > 0) {
            return backgroundImage;
        }

        const explicit =
            document.querySelector("[data-glass-background]") ||
            document.getElementById("wallpaper") ||
            document.querySelector("img.glass-wallpaper") ||
            document.querySelector("img[src*='wallpaper']");

        if (explicit && explicit.tagName === "IMG") {
            backgroundImage = explicit;
            return backgroundImage;
        }

        // Check for any visible or hidden img tag
        const anyImg = document.querySelector("img");
        if (anyImg) {
            backgroundImage = anyImg;
            return backgroundImage;
        }

        return null;
    }

    /**
     * Locate screen canvas in DOM if present
     */
    function findScreenCanvas() {
        if (!screenCanvas) {
            screenCanvas = document.getElementById("screen") || document.querySelector("canvas.screen");
            if (screenCanvas) {
                screenCtx = screenCanvas.getContext("2d");
            }
        }
        return screenCanvas;
    }

    /**
     * Resizes wallpaper to cover viewport and captures background pixels
     */
    function resizeBackground() {
        const image = findBackgroundImage();
        if (!image || !image.complete || image.naturalWidth === 0) {
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        findScreenCanvas();
        if (screenCanvas) {
            screenCanvas.width = width;
            screenCanvas.height = height;
        }

        baseCanvas.width = width;
        baseCanvas.height = height;

        const imgW = image.naturalWidth;
        const imgH = image.naturalHeight;

        // object-fit: cover calculation
        const scale = Math.max(width / imgW, height / imgH);
        const drawWidth = imgW * scale;
        const drawHeight = imgH * scale;
        const drawX = (width - drawWidth) / 2;
        const drawY = (height - drawHeight) / 2;

        baseCtx.clearRect(0, 0, width, height);
        baseCtx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

        // Draw background to visible screen canvas if present
        if (screenCanvas && screenCtx) {
            screenCtx.clearRect(0, 0, width, height);
            screenCtx.drawImage(baseCanvas, 0, 0);
        }

        backgroundPixels = baseCtx.getImageData(0, 0, width, height);

        renderAll();
    }

    /**
     * Render the refracted lens onto a single glass element's canvas.
     * The falloff is normalized independently per axis (against the
     * element's own half-width/half-height), so it automatically fits
     * whatever size and aspect ratio the element has - square,
     * rectangular, or anything in between - with the bend growing
     * toward whichever edge is closest.
     */
    function renderLens(element) {
        if (!element || !element._glassCanvas || !backgroundPixels) {
            return;
        }

        const canvas = element._glassCanvas;
        const rect = element.getBoundingClientRect();

        const width = Math.round(rect.width) || 220;
        const height = Math.round(rect.height) || 220;
        const halfW = width / 2;
        const halfH = height / 2;
        const bendScale = Math.min(halfW, halfH);

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext("2d");
        const lensImage = ctx.createImageData(width, height);
        const output = lensImage.data;
        const input = backgroundPixels.data;
        const bgW = backgroundPixels.width;
        const bgH = backgroundPixels.height;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dx = x - halfW;
                const dy = y - halfH;

                // Distance to nearest edge, normalized per-axis so
                // rectangles distort symmetrically toward all 4 sides
                const nx = Math.abs(dx) / halfW;
                const ny = Math.abs(dy) / halfH;
                const normalized = Math.max(nx, ny);

                // Smoothstep distortion curve
                let distortion = Math.max(0, (normalized - DISTORTION_START) / (1 - DISTORTION_START));
                distortion = distortion * distortion * (3 - 2 * distortion);
                const bend = distortion * distortion * REFRACTION * bendScale;

                // Bend direction uses the true radial angle, so corners
                // bend diagonally and edges bend perpendicular to themselves
                const distance = Math.sqrt(dx * dx + dy * dy);
                let dirX = 0;
                let dirY = 0;
                if (distance > 0.001) {
                    dirX = dx / distance;
                    dirY = dy / distance;
                }

                // Sample coordinate on background
                let sx = centerX + dx + dirX * bend;
                let sy = centerY + dy + dirY * bend;

                // Keep inside screen bounds
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

                // Bilinear interpolation per color channel without heap allocations
                const topR = input[p00] * (1 - fx) + input[p10] * fx;
                const botR = input[p01] * (1 - fx) + input[p11] * fx;
                output[outIdx] = topR * (1 - fy) + botR * fy;

                const topG = input[p00 + 1] * (1 - fx) + input[p10 + 1] * fx;
                const botG = input[p01 + 1] * (1 - fx) + input[p11 + 1] * fx;
                output[outIdx + 1] = topG * (1 - fy) + botG * fy;

                const topB = input[p00 + 2] * (1 - fx) + input[p10 + 2] * fx;
                const botB = input[p01 + 2] * (1 - fx) + input[p11 + 2] * fx;
                output[outIdx + 2] = topB * (1 - fy) + botB * fy;

                // Fully opaque lens - the whole element is filled;
                // your own border-radius/overflow:hidden shapes it
                output[outIdx + 3] = 255;
            }
        }

        ctx.putImageData(lensImage, 0, 0);
    }

    /**
     * Render all currently active glass elements
     */
    function renderAll() {
        for (const el of attachedElements) {
            if (document.body.contains(el)) {
                renderLens(el);
            } else {
                attachedElements.delete(el);
            }
        }
    }

    /**
     * Turn any element with class `.glass` into a liquid glass lens
     */
    function attachGlass(element) {
        if (!element || element._glassAttached) return;
        element._glassAttached = true;

        // Ensure canvas exists inside the element
        let canvas = element.querySelector(":scope > .glass-canvas");
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.className = "glass-canvas";
            element.prepend(canvas);
        }

        element._glassCanvas = canvas;
        attachedElements.add(element);

        // Initial render for this element if background is ready
        if (backgroundPixels) {
            renderLens(element);
        }
    }

    /**
     * Detach glass effect from an element
     */
    function detachGlass(element) {
        if (!element || !element._glassAttached) return;
        attachedElements.delete(element);
        element._glassAttached = false;
        if (element._glassCanvas) {
            element._glassCanvas.remove();
            element._glassCanvas = null;
        }
    }

    /**
     * Scan document for all elements with class "glass"
     */
    function scanAndAttach(rootNode = document) {
        if (rootNode.nodeType === Node.ELEMENT_NODE && rootNode.classList.contains("glass")) {
            attachGlass(rootNode);
        }
        const elements = rootNode.querySelectorAll ? rootNode.querySelectorAll(".glass") : [];
        for (let i = 0; i < elements.length; i++) {
            attachGlass(elements[i]);
        }
    }

    /**
     * Observe DOM for newly added elements with class "glass" or class changes
     */
    function setupObserver() {
        if (typeof MutationObserver === "undefined") return;

        const observer = new MutationObserver(function (mutations) {
            for (let i = 0; i < mutations.length; i++) {
                const mutation = mutations[i];

                if (mutation.type === "childList") {
                    for (let j = 0; j < mutation.addedNodes.length; j++) {
                        const node = mutation.addedNodes[j];
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            scanAndAttach(node);
                        }
                    }
                    for (let j = 0; j < mutation.removedNodes.length; j++) {
                        const node = mutation.removedNodes[j];
                        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains("glass")) {
                            detachGlass(node);
                        }
                    }
                } else if (mutation.type === "attributes" && mutation.attributeName === "class") {
                    const target = mutation.target;
                    if (target.classList && target.classList.contains("glass")) {
                        attachGlass(target);
                    } else if (target._glassAttached) {
                        detachGlass(target);
                    }
                }
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
        });
    }

    /**
     * Programmatically create a new glass element
     */
    function createGlass(options = {}) {
        const div = document.createElement("div");
        div.className = "glass";

        if (options.id) div.id = options.id;
        if (options.size) {
            div.style.width = typeof options.size === "number" ? options.size + "px" : options.size;
            div.style.height = typeof options.size === "number" ? options.size + "px" : options.size;
        }
        if (options.x !== undefined) {
            div.style.left = typeof options.x === "number" ? options.x + "px" : options.x;
        }
        if (options.y !== undefined) {
            div.style.top = typeof options.y === "number" ? options.y + "px" : options.y;
        }

        const parent = options.parent || document.body;
        parent.appendChild(div);
        return div;
    }

    /**
     * Main initialization
     */
    function init() {
        setupObserver();
        scanAndAttach();

        const img = findBackgroundImage();
        if (img) {
            if (img.complete && img.naturalWidth > 0) {
                resizeBackground();
            } else {
                img.addEventListener("load", resizeBackground);
            }
        }

        window.addEventListener("resize", resizeBackground);
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    return {
        init: init,
        attach: attachGlass,
        detach: detachGlass,
        render: renderLens,
        renderAll: renderAll,
        resize: resizeBackground,
        create: createGlass,
        setBackground: function (img) {
            backgroundImage = img;
            resizeBackground();
        },
        setRefraction: function (val) {
            REFRACTION = Number(val) || 0.38;
            renderAll();
        },
        setDistortionStart: function (val) {
            DISTORTION_START = Number(val) || 0.8;
            renderAll();
        }
    };
}));