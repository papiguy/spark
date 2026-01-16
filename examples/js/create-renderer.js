/**
 * Creates either a WebGLRenderer or WebGPURenderer based on:
 * 1. URL parameter (?webgpu or ?webgl)
 * 2. WebGPU availability
 *
 * Usage:
 *   import { createRenderer, isWebGPU } from "/examples/js/create-renderer.js";
 *   const renderer = await createRenderer();
 *   console.log("Using WebGPU:", isWebGPU(renderer));
 */

// Track created renderer for cleanup on page unload
let currentRenderer = null;

// Cleanup on page unload to release GPU contexts
window.addEventListener("beforeunload", () => {
  if (currentRenderer) {
    console.log("[createRenderer] Disposing renderer on page unload");
    currentRenderer.dispose();
    currentRenderer = null;
  }
});

// Also cleanup on visibility change (helps with context loss)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && currentRenderer) {
    // Don't dispose on hide, but could force context loss recovery
    console.log("[createRenderer] Page hidden, renderer still active");
  }
});

// Check URL for explicit renderer preference
function getRendererPreference() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("webgpu")) return "webgpu";
  if (params.has("webgl")) return "webgl";
  return "auto"; // Let system decide
}

// Check if WebGPU is available
async function isWebGPUAvailable() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Creates the appropriate renderer based on preferences and availability.
 *
 * @param {Object} options - Options passed to the renderer constructor
 * @returns {Promise<THREE.WebGLRenderer | THREE.WebGPURenderer>}
 */
export async function createRenderer(options = {}) {
  const THREE = await import("three");
  const preference = getRendererPreference();
  const webgpuAvailable = await isWebGPUAvailable();

  console.log("[createRenderer] preference:", preference);
  console.log("[createRenderer] webgpuAvailable:", webgpuAvailable);

  // Use WebGPU if explicitly requested and available
  if (preference === "webgpu") {
    if (!webgpuAvailable) {
      console.warn(
        "WebGPU requested but not available. Falling back to WebGL.",
      );
    } else {
      try {
        console.log("[createRenderer] Attempting to create WebGPU renderer...");
        const { WebGPURenderer } = await import("three/webgpu");
        console.log("[createRenderer] WebGPURenderer imported successfully");

        const renderer = new WebGPURenderer({
          antialias: false,
          ...options,
        });
        console.log("[createRenderer] WebGPURenderer created, initializing...");

        // Initialize the WebGPU renderer
        await renderer.init();
        console.log("[createRenderer] WebGPURenderer initialized");

        // Add a flag so examples can check renderer type
        renderer._sparkRendererType = "webgpu";

        // Track for cleanup
        currentRenderer = renderer;

        console.log("Using WebGPU renderer");
        return renderer;
      } catch (error) {
        console.error("Failed to create WebGPU renderer:", error);
        console.warn("Falling back to WebGL.");
      }
    }
  }

  // Create WebGL renderer (default or fallback)
  console.log("[createRenderer] Creating WebGL renderer...");
  const renderer = new THREE.WebGLRenderer({
    antialias: false, // Antialias doesn't help splats and reduces performance
    ...options,
  });

  // Add a flag so examples can check renderer type
  renderer._sparkRendererType = "webgl";

  // Track for cleanup
  currentRenderer = renderer;

  console.log("Using WebGL renderer");
  return renderer;
}

/**
 * Manually dispose the current renderer to release GPU context.
 * Call this before creating a new renderer or when done with rendering.
 */
export function disposeRenderer() {
  if (currentRenderer) {
    console.log("[createRenderer] Manually disposing renderer");
    currentRenderer.dispose();
    currentRenderer = null;
  }
}

/**
 * Check if renderer is using WebGPU
 * @param {THREE.WebGLRenderer | THREE.WebGPURenderer} renderer
 * @returns {boolean}
 */
export function isWebGPU(renderer) {
  return renderer._sparkRendererType === "webgpu";
}

/**
 * Get a display string for the current renderer type
 * @param {THREE.WebGLRenderer | THREE.WebGPURenderer} renderer
 * @returns {string}
 */
export function getRendererName(renderer) {
  return isWebGPU(renderer) ? "WebGPU" : "WebGL";
}

/**
 * Create a status indicator showing the current renderer type
 * @param {THREE.WebGLRenderer | THREE.WebGPURenderer} renderer
 */
export function showRendererStatus(renderer) {
  const status = document.createElement("div");
  status.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 10px;
    font-family: monospace;
    font-size: 12px;
    border-radius: 4px;
    z-index: 1000;
  `;
  status.textContent = `Renderer: ${getRendererName(renderer)}`;

  // Add link to switch renderer
  const switchUrl = new URL(window.location.href);
  if (isWebGPU(renderer)) {
    switchUrl.searchParams.delete("webgpu");
    switchUrl.searchParams.set("webgl", "");
  } else {
    switchUrl.searchParams.delete("webgl");
    switchUrl.searchParams.set("webgpu", "");
  }

  const link = document.createElement("a");
  link.href = switchUrl.toString();
  link.textContent = ` [Switch to ${isWebGPU(renderer) ? "WebGL" : "WebGPU"}]`;
  link.style.color = "#88f";
  status.appendChild(link);

  document.body.appendChild(status);
}
