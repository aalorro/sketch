/**
 * Quality tier detection — auto-selects the best rendering tier
 * based on GPU backend and device capabilities.
 */

import { QualityTier, TIER_BUDGETS, TierSettings } from '../types-v2';

/**
 * Detect the best quality tier for the given backend.
 *
 * WebGPU tiers:
 *   - webgpu-high: device supports >= 256 MB buffers and >= 65535 workgroups per dimension
 *   - webgpu-mid:  fallback for all other WebGPU devices
 *
 * WebGL2 tiers:
 *   - webgl2-mid:  returned as default (use detectWebGL2Tier for refined detection)
 */
export function detectTier(backend: 'webgpu' | 'webgl2', device?: GPUDevice): QualityTier {
  if (backend === 'webgpu') {
    if (device) {
      const maxBufferSize = device.limits.maxBufferSize;
      const maxComputeWorkgroups = device.limits.maxComputeWorkgroupsPerDimension;
      // High tier: device supports large buffers (256 MB) and many workgroups
      if (maxBufferSize >= 268435456 && maxComputeWorkgroups >= 65535) {
        return 'webgpu-high';
      }
    }
    return 'webgpu-mid';
  }
  // WebGL2 default — caller should use detectWebGL2Tier() for refined detection
  return 'webgl2-mid';
}

/**
 * Get the budget/settings for a given quality tier.
 */
export function getTierSettings(tier: QualityTier): TierSettings {
  return TIER_BUDGETS[tier];
}

/**
 * Refined WebGL2 tier detection using extension probing.
 *
 * webgl2-mid requires:
 *   - EXT_color_buffer_float (render to float textures)
 *   - EXT_float_blend (blend float render targets)
 *
 * webgl2-low is the fallback when float rendering is not fully supported.
 */
export function detectWebGL2Tier(gl: WebGL2RenderingContext): QualityTier {
  const floatExt = gl.getExtension('EXT_color_buffer_float');
  const floatBlend = gl.getExtension('EXT_float_blend');
  if (floatExt && floatBlend) return 'webgl2-mid';
  return 'webgl2-low';
}
