/**
 * MediumPipeline — core orchestrator for the physics-based rendering engine.
 *
 * Owns persistent GPU textures (via texture pools) and runs the pass graph
 * that transforms a source image into a stylized medium simulation.
 * Supports both WebGPU (compute shaders) and WebGL2 (fragment shaders) backends,
 * with WebGPU tried first and WebGL2 used as a fallback.
 *
 * Phase 1 (passes 0-4) — Foundation:
 *   0 - Ingest:    sRGB -> linear RGBA16F
 *   1 - Structure: Scharr gradient + structure tensor
 *   2 - ETF:       Edge Tangent Flow refinement (ping-pong)
 *   3 - Tone:      Bilateral filter + luminance quantization
 *   4 - Edges:     FDoG along ETF + XDoG threshold
 *
 * Phase 2+3 (passes 5-10) — Medium Simulation:
 *   Substrate:  Procedural paper heightmap generation
 *   5 - Seed:      Blue-noise mark placement (stub — copies tone to density)
 *   6 - Integrate: RK2 streamline trace along ETF (stub)
 *   7 - Deposit:   Nib footprint splat (stub)
 *   8 - Resolve:   Tooth occlusion + density + Beer-Lambert + sheen
 *   9 - Wet:       Advection-diffusion (optional, not yet implemented)
 *  10 - Present:   Exposure, contrast, Reinhard tone map, linear->sRGB
 */

import {
  QualityTier,
  TierSettings,
  RenderRequest,
  TIER_BUDGETS,
} from '../types-v2';

import type { MediumParams, SubstrateParams, TechniqueParams } from '../types-v2';

import { PassGraph } from './pass-graph';
import { WebGPUTexturePool, WebGL2TexturePool } from './texture-pool';
import { detectTier, detectWebGL2Tier, getTierSettings } from './tier';

import { getMediumParams } from '../medium-presets';
import { getSubstrateParams } from '../substrate-presets';
import { getTechniqueParams } from '../technique-presets';

// -- WGSL shader imports (Vite ?raw) ------------------------------------------
import ingestWGSL from './shaders/ingest.wgsl?raw';
import scharrWGSL from './shaders/scharr.wgsl?raw';
import etfWGSL from './shaders/etf.wgsl?raw';
import toneWGSL from './shaders/tone.wgsl?raw';
import fdogWGSL from './shaders/fdog.wgsl?raw';
import substrateWGSL from './shaders/substrate.wgsl?raw';
import resolveWGSL from './shaders/resolve.wgsl?raw';
import wetWGSL from './shaders/wet.wgsl?raw';
import presentWGSL from './shaders/present.wgsl?raw';

// -- GLSL shader imports (Vite ?raw) ------------------------------------------
import fullscreenVert from './glsl/fullscreen.vert?raw';
import ingestFrag from './glsl/ingest.frag?raw';
import scharrFrag from './glsl/scharr.frag?raw';
import etfFrag from './glsl/etf.frag?raw';
import toneFrag from './glsl/tone.frag?raw';
import fdogFrag from './glsl/fdog.frag?raw';
import substrateFrag from './glsl/substrate.frag?raw';
import resolveFrag from './glsl/resolve.frag?raw';
import wetFrag from './glsl/wet.frag?raw';
import presentFrag from './glsl/present.frag?raw';

// -- Result type --------------------------------------------------------------

export interface MediumPipelineResult {
  imageData: ImageData;
  tier: QualityTier;
  timings?: Record<string, number>;
}

// -- Cached pipeline entries --------------------------------------------------

interface CachedComputePipeline {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

interface CachedGLProgram {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

// =============================================================================
//  MediumPipeline
// =============================================================================

export class MediumPipeline {
  private backend: 'webgpu' | 'webgl2';
  private tier: QualityTier;
  private tierSettings: TierSettings;

  // WebGPU resources
  private device?: GPUDevice;
  private texturePool?: WebGPUTexturePool;
  private pipelineCache: Map<string, CachedComputePipeline> = new Map();

  // WebGL2 resources
  private gl?: WebGL2RenderingContext;
  private glCanvas?: OffscreenCanvas | HTMLCanvasElement;
  private glTexturePool?: WebGL2TexturePool;
  private programCache: Map<string, CachedGLProgram> = new Map();
  private glVAO?: WebGLVertexArrayObject;

  private passGraph: PassGraph;
  private width = 0;
  private height = 0;

  // ---------------------------------------------------------------------------
  //  Private constructor (use static create())
  // ---------------------------------------------------------------------------

  private constructor(
    backend: 'webgpu' | 'webgl2',
    tier: QualityTier,
    passGraph: PassGraph,
  ) {
    this.backend = backend;
    this.tier = tier;
    this.tierSettings = getTierSettings(tier);
    this.passGraph = passGraph;
  }

  // ---------------------------------------------------------------------------
  //  Factory
  // ---------------------------------------------------------------------------

  /**
   * Factory: try WebGPU first, fall back to WebGL2, return null if neither
   * backend can be initialised.
   */
  static async create(): Promise<MediumPipeline | null> {
    // ---- Try WebGPU ----------------------------------------------------
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: 'high-performance',
        });
        if (adapter) {
          const device = await adapter.requestDevice({
            requiredLimits: {
              maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
              maxBufferSize: adapter.limits.maxBufferSize,
            },
          });

          const tier = detectTier('webgpu', device);
          const graph = PassGraph.buildFull();
          const pipeline = new MediumPipeline('webgpu', tier, graph);

          pipeline.device = device;
          pipeline.texturePool = new WebGPUTexturePool(device);

          // React to device loss
          device.lost.then((info) => {
            console.error('[MediumPipeline] WebGPU device lost:', info.message);
            pipeline.device = undefined;
          });

          // Pre-compile every compute pipeline so first render is fast
          pipeline.getOrCreateComputePipeline('ingest', ingestWGSL);
          pipeline.getOrCreateComputePipeline('scharr', scharrWGSL);
          pipeline.getOrCreateComputePipeline('etf', etfWGSL);
          pipeline.getOrCreateComputePipeline('tone', toneWGSL);
          pipeline.getOrCreateComputePipeline('fdog', fdogWGSL);
          pipeline.getOrCreateComputePipeline('substrate', substrateWGSL);
          pipeline.getOrCreateComputePipeline('resolve', resolveWGSL);
          pipeline.getOrCreateComputePipeline('wet', wetWGSL);
          pipeline.getOrCreateComputePipeline('present', presentWGSL);

          console.log(`[MediumPipeline] WebGPU ready (tier: ${tier})`);
          return pipeline;
        }
      } catch (err) {
        console.warn('[MediumPipeline] WebGPU init failed:', err);
      }
    }

    // ---- Fall back to WebGL2 -------------------------------------------
    try {
      let canvas: OffscreenCanvas | HTMLCanvasElement;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(1, 1);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
      }

      const gl = canvas.getContext('webgl2', {
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
      }) as WebGL2RenderingContext | null;

      if (!gl) {
        console.warn('[MediumPipeline] WebGL2 context creation failed');
        return null;
      }

      // EXT_color_buffer_float is mandatory — we render to float textures
      const floatExt = gl.getExtension('EXT_color_buffer_float');
      if (!floatExt) {
        console.warn(
          '[MediumPipeline] EXT_color_buffer_float not available; '
          + 'cannot render to float FBOs',
        );
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        return null;
      }

      // Optional but beneficial
      gl.getExtension('EXT_float_blend');

      const tier = detectWebGL2Tier(gl);
      const graph = PassGraph.buildFull();
      const pipeline = new MediumPipeline('webgl2', tier, graph);

      pipeline.gl = gl;
      pipeline.glCanvas = canvas;
      pipeline.glTexturePool = new WebGL2TexturePool(gl);

      const vao = gl.createVertexArray();
      if (!vao) {
        console.warn('[MediumPipeline] Failed to create WebGL2 VAO');
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        return null;
      }
      pipeline.glVAO = vao;

      // Pre-compile every fragment program
      const shaderDefs: Array<{
        name: string;
        frag: string;
        uniforms: string[];
      }> = [
        {
          name: 'ingest',
          frag: ingestFrag,
          uniforms: ['uTexture', 'uExposure'],
        },
        {
          name: 'scharr',
          frag: scharrFrag,
          uniforms: ['uTexture', 'uTexelSize'],
        },
        {
          name: 'etf',
          frag: etfFrag,
          uniforms: [
            'uStructure', 'uPrevETF', 'uTexelSize', 'uKernelRadius',
          ],
        },
        {
          name: 'tone',
          frag: toneFrag,
          uniforms: [
            'uTexture', 'uTexelSize', 'uRadius', 'uLevels', 'uSigmaRange',
          ],
        },
        {
          name: 'fdog',
          frag: fdogFrag,
          uniforms: [
            'uTone', 'uETF', 'uTexelSize',
            'uSigma1', 'uSigma2', 'uTau', 'uPhi', 'uSamples',
          ],
        },
        {
          name: 'substrate',
          frag: substrateFrag,
          uniforms: [
            'uHeightScale', 'uGrainFreqX', 'uGrainFreqY',
            'uFiberAmount', 'uFiberAngle', 'uSeed',
          ],
        },
        {
          name: 'resolve',
          frag: resolveFrag,
          uniforms: [
            'uDensityTex', 'uHeightTex', 'uSourceTex',
            'uToothContact', 'uToothSoftness',
            'uMaxDensity', 'uAbsorptionR', 'uAbsorptionG', 'uAbsorptionB',
            'uSheen', 'uSheenPower',
            'uBaseColorR', 'uBaseColorG', 'uBaseColorB',
            'uLightDirX', 'uLightDirY', 'uLightDirZ',
            'uColorModel',
          ],
        },
        {
          name: 'wet',
          frag: wetFrag,
          uniforms: [
            'uInputTex', 'uWetness', 'uBleedRadius', 'uEdgeDarkening',
            'uBackrun', 'uWidth', 'uHeight', 'uIteration', 'uSeed',
          ],
        },
        {
          name: 'present',
          frag: presentFrag,
          uniforms: [
            'uTexture', 'uGamma', 'uExposure', 'uContrast',
          ],
        },
      ];

      for (const def of shaderDefs) {
        try {
          pipeline.getOrCreateGLProgram(def.name, def.frag, def.uniforms);
        } catch (err) {
          console.error(
            `[MediumPipeline] Failed to compile GL program "${def.name}":`, err,
          );
          pipeline.destroy();
          return null;
        }
      }

      console.log(`[MediumPipeline] WebGL2 ready (tier: ${tier})`);
      return pipeline;
    } catch (err) {
      console.warn('[MediumPipeline] WebGL2 init failed:', err);
    }

    console.warn('[MediumPipeline] No GPU backend available');
    return null;
  }

  // ===========================================================================
  //  Public API
  // ===========================================================================

  /**
   * Run the full pipeline (passes 0-10), producing a physics-simulated
   * medium rendering from any input image.
   */
  async render(request: RenderRequest): Promise<MediumPipelineResult> {
    const timings: Record<string, number> = {};
    const t0 = performance.now();

    const { source } = request;
    const w = source.width;
    const h = source.height;

    // Resolve tier and settings
    const tier = request.tier ?? this.tier;
    const settings = TIER_BUDGETS[tier] ?? this.tierSettings;

    // -- Look up medium / substrate / technique presets ----------------------
    const medium = getMediumParams(request.medium, request.mediumOverrides);
    const substrate = getSubstrateParams(request.substrate);
    const technique = getTechniqueParams(request.technique);

    // -- Map RenderRequest parameters to per-pass parameters ----------------
    const exposure = 1.0;
    const bilateralRadius = settings.bilateralRadius;       // 3-7
    const toneLevels = 4 + (request.intensity - 1);         // 4-13
    const sigmaRange = 0.08;
    const etfIterations = settings.etfIterations;           // 1-3
    const fdogSigma1 = 0.5 + request.stroke * 0.3;         // 0.8-3.5
    const fdogSigma2 = fdogSigma1 * 1.6;
    const fdogTau = 0.99;
    const fdogPhi = 2.0;
    const fdogSamples = settings.fdogSamples;               // 5-15

    // -- Resize textures if dimensions changed ------------------------------
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.allocateTextures(w, h);
    }

    // -- Dispatch to the active backend -------------------------------------
    let result: ImageData;

    if (this.backend === 'webgpu') {
      result = await this.renderWebGPU(
        source.data, w, h,
        exposure, bilateralRadius, toneLevels, sigmaRange,
        etfIterations, fdogSigma1, fdogSigma2, fdogTau, fdogPhi, fdogSamples,
        medium, substrate, technique, request.seed,
        timings,
      );
    } else {
      result = await this.renderWebGL2(
        source, w, h,
        exposure, bilateralRadius, toneLevels, sigmaRange,
        etfIterations, fdogSigma1, fdogSigma2, fdogTau, fdogPhi, fdogSamples,
        medium, substrate, technique, request.seed,
        timings,
      );
    }

    timings['total'] = performance.now() - t0;
    return { imageData: result, tier, timings };
  }

  /**
   * Release all GPU resources.
   */
  destroy(): void {
    if (this.backend === 'webgpu') {
      this.pipelineCache.clear();
      if (this.texturePool) {
        this.texturePool.destroy();
        this.texturePool = undefined;
      }
      if (this.device) {
        this.device.destroy();
        this.device = undefined;
      }
    } else {
      const gl = this.gl;
      if (gl) {
        for (const { program } of this.programCache.values()) {
          gl.deleteProgram(program);
        }
        this.programCache.clear();

        if (this.glVAO) {
          gl.deleteVertexArray(this.glVAO);
          this.glVAO = undefined;
        }
        if (this.glTexturePool) {
          this.glTexturePool.destroy();
          this.glTexturePool = undefined;
        }

        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        this.gl = undefined;
        this.glCanvas = undefined;
      }
    }
  }

  // ===========================================================================
  //  Texture allocation
  // ===========================================================================

  /**
   * Allocate (or resize) every texture slot the current pass graph requires,
   * plus the extra ping-pong texture used by the ETF pass.
   *
   * The Scharr pass writes four components (Jxx, Jxy, Jyy, luminance) into an
   * rgba16float texture, but the pass graph declares the structure slot as
   * rg16f. We allocate a separate "structure_rgba16f" slot that the Scharr
   * shader actually writes to; the ETF pass then reads from it.
   */
  private allocateTextures(w: number, h: number): void {
    const requiredSlots = this.passGraph.getRequiredSlots();

    if (this.backend === 'webgpu' && this.texturePool) {
      for (const slot of requiredSlots) {
        const sw = Math.max(1, Math.round(w * slot.scale));
        const sh = Math.max(1, Math.round(h * slot.scale));
        this.texturePool.allocate(slot.id, sw, sh, slot.format);
      }
      // Extra slots for Phase 1
      this.texturePool.allocate('structure_rgba16f', w, h, 'rgba16f');
      this.texturePool.allocate('etf_rg16f_prev', w, h, 'rg16f');
      // Phase 2+3 slots (allocated explicitly in case graph pruning drops them)
      this.texturePool.allocate('substrate_r16f', w, h, 'r16f');
      this.texturePool.allocate('density_r16f', w, h, 'r16f');
      this.texturePool.allocate('resolved_rgba16f', w, h, 'rgba16f');
      this.texturePool.allocate('wet_ping_rgba16f', w, h, 'rgba16f');
      this.texturePool.allocate('final_rgba8', w, h, 'rgba8');

    } else if (this.backend === 'webgl2' && this.glTexturePool) {
      for (const slot of requiredSlots) {
        const sw = Math.max(1, Math.round(w * slot.scale));
        const sh = Math.max(1, Math.round(h * slot.scale));
        this.glTexturePool.allocate(slot.id, sw, sh, slot.format);
      }
      this.glTexturePool.allocate('structure_rgba16f', w, h, 'rgba16f');
      this.glTexturePool.allocate('etf_rg16f_prev', w, h, 'rg16f');
      // Phase 2+3 slots
      this.glTexturePool.allocate('substrate_r16f', w, h, 'r16f');
      this.glTexturePool.allocate('density_r16f', w, h, 'r16f');
      this.glTexturePool.allocate('resolved_rgba16f', w, h, 'rgba16f');
      this.glTexturePool.allocate('wet_ping_rgba16f', w, h, 'rgba16f');
      this.glTexturePool.allocate('final_rgba8', w, h, 'rgba8');
    }
  }

  // ===========================================================================
  //  WebGPU helpers
  // ===========================================================================

  /**
   * Retrieve (or compile and cache) a compute pipeline for the given WGSL
   * shader source.
   */
  private getOrCreateComputePipeline(
    name: string,
    wgslCode: string,
  ): CachedComputePipeline {
    const cached = this.pipelineCache.get(name);
    if (cached) return cached;

    const device = this.device!;
    const shaderModule = device.createShaderModule({
      label: `medium-${name}-shader`,
      code: wgslCode,
    });

    const pipeline = device.createComputePipeline({
      label: `medium-${name}-pipeline`,
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' },
    });

    const bindGroupLayout = pipeline.getBindGroupLayout(0);
    const entry: CachedComputePipeline = { pipeline, bindGroupLayout };
    this.pipelineCache.set(name, entry);
    return entry;
  }

  /**
   * Create a GPU uniform buffer, write data into it, and return it.
   * Caller is responsible for destroying the buffer after use.
   */
  private createUniformBuffer(label: string, data: ArrayBuffer): GPUBuffer {
    const device = this.device!;
    const buf = device.createBuffer({
      label,
      size: Math.max(data.byteLength, 16),
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  /**
   * Encode and submit a single compute dispatch, then wait for it to finish.
   */
  private async dispatchCompute(
    label: string,
    pipeline: GPUComputePipeline,
    bindGroup: GPUBindGroup,
    wgX: number,
    wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const encoder = device.createCommandEncoder({ label: `${label}-encoder` });
    const pass = encoder.beginComputePass({ label: `${label}-pass` });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(wgX, wgY);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  }

  // ===========================================================================
  //  WebGPU render path
  // ===========================================================================

  private async renderWebGPU(
    inputBytes: Uint8ClampedArray,
    w: number,
    h: number,
    exposure: number,
    bilateralRadius: number,
    toneLevels: number,
    sigmaRange: number,
    etfIterations: number,
    fdogSigma1: number,
    fdogSigma2: number,
    fdogTau: number,
    fdogPhi: number,
    fdogSamples: number,
    medium: MediumParams,
    substrate: SubstrateParams,
    _technique: TechniqueParams,
    seed: number,
    timings: Record<string, number>,
  ): Promise<ImageData> {
    const wgX = Math.ceil(w / 8);
    const wgY = Math.ceil(h / 8);
    // Substrate shader uses 16x16 workgroups
    const wgX16 = Math.ceil(w / 16);
    const wgY16 = Math.ceil(h / 16);

    // -- Pass 0: Ingest (sRGB -> linear) ----------------------------------
    let t = performance.now();
    await this.gpuPassIngest(inputBytes, w, h, exposure, wgX, wgY);
    timings['ingest'] = performance.now() - t;

    // -- Pass 1: Scharr gradient + structure tensor -----------------------
    t = performance.now();
    await this.gpuPassScharr(w, h, wgX, wgY);
    timings['scharr'] = performance.now() - t;

    // -- Pass 2: ETF refinement (ping-pong) -------------------------------
    t = performance.now();
    await this.gpuPassETF(w, h, etfIterations, wgX, wgY);
    timings['etf'] = performance.now() - t;

    // -- Pass 3: Tone (bilateral + quantise) ------------------------------
    t = performance.now();
    await this.gpuPassTone(w, h, bilateralRadius, toneLevels, sigmaRange, wgX, wgY);
    timings['tone'] = performance.now() - t;

    // -- Pass 4: FDoG edge detection --------------------------------------
    t = performance.now();
    await this.gpuPassFDoG(w, h, fdogSigma1, fdogSigma2, fdogTau, fdogPhi, fdogSamples, wgX, wgY);
    timings['fdog'] = performance.now() - t;

    // -- Substrate: procedural paper heightmap ----------------------------
    t = performance.now();
    await this.gpuPassSubstrate(w, h, substrate, seed, wgX16, wgY16);
    timings['substrate'] = performance.now() - t;

    // -- Passes 5-7: Seed / Integrate / Deposit ---------------------------
    // TODO: Full stroke synthesis with storage buffers and atomics.
    // For now, copy tone_r16f to density_r16f so field mediums (pencil,
    // charcoal, pastel) work immediately and stroke mediums get a
    // reasonable fallback using the quantized tone map as density.
    t = performance.now();
    await this.gpuStubCopyToneToDensity(w, h);
    timings['seed+integrate+deposit'] = performance.now() - t;

    // -- Pass 8: Resolve (tooth + density + sheen) ------------------------
    t = performance.now();
    await this.gpuPassResolve(w, h, medium, substrate, wgX16, wgY16);
    timings['resolve'] = performance.now() - t;

    // -- Pass 9: Wet (skip if wetness === 0) ------------------------------
    if (medium.wetness > 0) {
      t = performance.now();
      const wetIterations = this.tierSettings.wetIterations;
      await this.gpuPassWet(w, h, medium, seed, wetIterations, wgX16, wgY16);
      timings['wet'] = performance.now() - t;
    }

    // -- Pass 10: Present (tone curve + sRGB) -----------------------------
    t = performance.now();
    await this.gpuPassPresent(w, h, wgX16, wgY16);
    timings['present'] = performance.now() - t;

    // -- Read back --------------------------------------------------------
    t = performance.now();
    const result = await this.gpuReadBack('final_rgba8', w, h);
    timings['readback'] = performance.now() - t;

    return result;
  }

  // -- Pass 0 (WebGPU): Ingest --------------------------------------------

  private async gpuPassIngest(
    inputBytes: Uint8ClampedArray,
    w: number, h: number,
    exposure: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;
    const { pipeline, bindGroupLayout } =
      this.getOrCreateComputePipeline('ingest', ingestWGSL);

    // Pack RGBA bytes into a u32 storage buffer
    const pixelCount = w * h;
    const packed = new Uint32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      packed[i] =
        inputBytes[off]
        | (inputBytes[off + 1] << 8)
        | (inputBytes[off + 2] << 16)
        | (inputBytes[off + 3] << 24);
    }

    const inputBuffer = device.createBuffer({
      label: 'ingest-input',
      size: packed.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(inputBuffer.getMappedRange()).set(packed);
    inputBuffer.unmap();

    // Params: { width u32, height u32, exposure f32, _pad u32 }
    const paramsData = new ArrayBuffer(16);
    const pv = new DataView(paramsData);
    pv.setUint32(0, w, true);
    pv.setUint32(4, h, true);
    pv.setFloat32(8, exposure, true);
    pv.setUint32(12, 0, true);
    const uniformBuffer = this.createUniformBuffer('ingest-params', paramsData);

    const outputEntry = pool.get('linear_rgba16f')!;

    const bindGroup = device.createBindGroup({
      label: 'ingest-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: outputEntry.view },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });

    await this.dispatchCompute('ingest', pipeline, bindGroup, wgX, wgY);

    inputBuffer.destroy();
    uniformBuffer.destroy();
  }

  // -- Pass 1 (WebGPU): Scharr -------------------------------------------

  private async gpuPassScharr(
    w: number, h: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;
    const { pipeline, bindGroupLayout } =
      this.getOrCreateComputePipeline('scharr', scharrWGSL);

    // Params: { width u32, height u32, _pad0 u32, _pad1 u32 }
    const paramsData = new ArrayBuffer(16);
    const pv = new DataView(paramsData);
    pv.setUint32(0, w, true);
    pv.setUint32(4, h, true);
    pv.setUint32(8, 0, true);
    pv.setUint32(12, 0, true);
    const uniformBuffer = this.createUniformBuffer('scharr-params', paramsData);

    // Scharr shader: binding 0 = texture_2d (linear), binding 1 = storage texture
    // (rgba16float), binding 2 = uniform params.
    // The shader writes 4 components (Jxx, Jxy, Jyy, lum) so we use the
    // structure_rgba16f slot rather than the pass-graph's rg16f slot.
    const inputEntry = pool.get('linear_rgba16f')!;
    const outputEntry = pool.get('structure_rgba16f')!;

    const bindGroup = device.createBindGroup({
      label: 'scharr-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: inputEntry.view },
        { binding: 1, resource: outputEntry.view },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });

    await this.dispatchCompute('scharr', pipeline, bindGroup, wgX, wgY);
    uniformBuffer.destroy();
  }

  // -- Pass 2 (WebGPU): ETF (ping-pong) ----------------------------------

  private async gpuPassETF(
    w: number, h: number,
    iterations: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;
    const { pipeline, bindGroupLayout } =
      this.getOrCreateComputePipeline('etf', etfWGSL);

    // Params: { width u32, height u32, kernelRadius u32, _pad u32 }
    const kernelRadius = 2; // 5x5 neighbourhood
    const paramsData = new ArrayBuffer(16);
    const pv = new DataView(paramsData);
    pv.setUint32(0, w, true);
    pv.setUint32(4, h, true);
    pv.setUint32(8, kernelRadius, true);
    pv.setUint32(12, 0, true);
    const uniformBuffer = this.createUniformBuffer('etf-params', paramsData);

    const structureEntry = pool.get('structure_rgba16f')!;
    const etfA = pool.get('etf_rg16f')!;      // slot A
    const etfB = pool.get('etf_rg16f_prev')!;  // slot B

    // Zero both ETF textures so the shader initialises from the structure tensor
    // eigenvectors on the first iteration (it checks length(prev) < 0.001).
    const bytesPerPixel = 4; // rg16float = 2 x f16 = 4 bytes
    const rowBytes = w * bytesPerPixel;
    const totalBytes = rowBytes * h;

    const zeroBuf = device.createBuffer({
      label: 'etf-zero',
      size: totalBytes,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Uint8Array(zeroBuf.getMappedRange()).fill(0);
    zeroBuf.unmap();

    const clearEncoder = device.createCommandEncoder({ label: 'etf-clear' });
    clearEncoder.copyBufferToTexture(
      { buffer: zeroBuf, bytesPerRow: rowBytes, rowsPerImage: h },
      { texture: etfA.texture },
      { width: w, height: h },
    );
    clearEncoder.copyBufferToTexture(
      { buffer: zeroBuf, bytesPerRow: rowBytes, rowsPerImage: h },
      { texture: etfB.texture },
      { width: w, height: h },
    );
    device.queue.submit([clearEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    zeroBuf.destroy();

    // Ping-pong: even iteration reads A and writes B, odd reads B and writes A.
    for (let i = 0; i < iterations; i++) {
      const readEntry = (i % 2 === 0) ? etfA : etfB;
      const writeEntry = (i % 2 === 0) ? etfB : etfA;

      const bindGroup = device.createBindGroup({
        label: `etf-bg-${i}`,
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: structureEntry.view },
          { binding: 1, resource: readEntry.view },
          { binding: 2, resource: writeEntry.view },
          { binding: 3, resource: { buffer: uniformBuffer } },
        ],
      });

      await this.dispatchCompute(`etf-iter${i}`, pipeline, bindGroup, wgX, wgY);
    }

    // After all iterations: if the count is odd the result sits in slot B.
    // Copy it to slot A so downstream passes always read etf_rg16f.
    if (iterations > 0 && iterations % 2 !== 0) {
      const copyEncoder = device.createCommandEncoder({ label: 'etf-final-copy' });
      copyEncoder.copyTextureToTexture(
        { texture: etfB.texture },
        { texture: etfA.texture },
        { width: w, height: h },
      );
      device.queue.submit([copyEncoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    }

    uniformBuffer.destroy();
  }

  // -- Pass 3 (WebGPU): Tone ---------------------------------------------

  private async gpuPassTone(
    w: number, h: number,
    radius: number, levels: number, sigmaRange: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const pool = this.texturePool!;
    const { pipeline, bindGroupLayout } =
      this.getOrCreateComputePipeline('tone', toneWGSL);

    // Params: { width u32, height u32, radius u32, levels u32,
    //           sigmaRange f32, _pad0 f32, _pad1 f32, _pad2 f32 }
    const paramsData = new ArrayBuffer(32);
    const pv = new DataView(paramsData);
    pv.setUint32(0, w, true);
    pv.setUint32(4, h, true);
    pv.setUint32(8, radius, true);
    pv.setUint32(12, levels, true);
    pv.setFloat32(16, sigmaRange, true);
    pv.setFloat32(20, 0.0, true);
    pv.setFloat32(24, 0.0, true);
    pv.setFloat32(28, 0.0, true);
    const uniformBuffer = this.createUniformBuffer('tone-params', paramsData);

    const inputEntry = pool.get('linear_rgba16f')!;
    const outputEntry = pool.get('tone_r16f')!;

    const bindGroup = this.device!.createBindGroup({
      label: 'tone-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: inputEntry.view },
        { binding: 1, resource: outputEntry.view },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });

    await this.dispatchCompute('tone', pipeline, bindGroup, wgX, wgY);
    uniformBuffer.destroy();
  }

  // -- Pass 4 (WebGPU): FDoG ---------------------------------------------

  private async gpuPassFDoG(
    w: number, h: number,
    sigma1: number, sigma2: number,
    tau: number, phi: number, samples: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const pool = this.texturePool!;
    const { pipeline, bindGroupLayout } =
      this.getOrCreateComputePipeline('fdog', fdogWGSL);

    // Params: { width u32, height u32, sigma1 f32, sigma2 f32,
    //           tau f32, phi f32, samples u32, _pad u32 }
    const paramsData = new ArrayBuffer(32);
    const pv = new DataView(paramsData);
    pv.setUint32(0, w, true);
    pv.setUint32(4, h, true);
    pv.setFloat32(8, sigma1, true);
    pv.setFloat32(12, sigma2, true);
    pv.setFloat32(16, tau, true);
    pv.setFloat32(20, phi, true);
    pv.setUint32(24, samples, true);
    pv.setUint32(28, 0, true);
    const uniformBuffer = this.createUniformBuffer('fdog-params', paramsData);

    const toneEntry = pool.get('tone_r16f')!;
    const etfEntry = pool.get('etf_rg16f')!;
    const outputEntry = pool.get('edges_r16f')!;

    const bindGroup = this.device!.createBindGroup({
      label: 'fdog-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: toneEntry.view },
        { binding: 1, resource: etfEntry.view },
        { binding: 2, resource: outputEntry.view },
        { binding: 3, resource: { buffer: uniformBuffer } },
      ],
    });

    await this.dispatchCompute('fdog', pipeline, bindGroup, wgX, wgY);
    uniformBuffer.destroy();
  }

  // -- Substrate (WebGPU): Procedural paper heightmap ----------------------

  private async gpuPassSubstrate(
    w: number, h: number,
    substrate: SubstrateParams,
    seed: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;
    const { pipeline } =
      this.getOrCreateComputePipeline('substrate', substrateWGSL);

    // SubstrateUniforms: { heightScale f32, grainFreqX f32, grainFreqY f32,
    //   fiberAmount f32, fiberAngle f32, seed u32, width u32, height u32 }
    const paramsData = new ArrayBuffer(32);
    const pv = new DataView(paramsData);
    pv.setFloat32(0, substrate.heightScale, true);
    pv.setFloat32(4, substrate.grainFreq[0], true);
    pv.setFloat32(8, substrate.grainFreq[1], true);
    pv.setFloat32(12, substrate.fiberAmount, true);
    pv.setFloat32(16, substrate.fiberAngle, true);
    pv.setUint32(20, seed >>> 0, true);
    pv.setUint32(24, w, true);
    pv.setUint32(28, h, true);
    const uniformBuffer = this.createUniformBuffer('substrate-params', paramsData);

    const outputEntry = pool.get('substrate_r16f')!;

    // The substrate shader uses two bind groups:
    //   @group(0) @binding(0) = params uniform
    //   @group(1) @binding(0) = output storage texture
    // Since we use 'auto' layout, the shader compiler determines the layout.
    // We need to create bind groups matching the shader's group layout.
    const bg0Layout = pipeline.getBindGroupLayout(0);
    const bg1Layout = pipeline.getBindGroupLayout(1);

    const bg0 = device.createBindGroup({
      label: 'substrate-bg0',
      layout: bg0Layout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
      ],
    });

    const bg1 = device.createBindGroup({
      label: 'substrate-bg1',
      layout: bg1Layout,
      entries: [
        { binding: 0, resource: outputEntry.view },
      ],
    });

    // Dispatch with two bind groups
    const encoder = device.createCommandEncoder({ label: 'substrate-encoder' });
    const pass = encoder.beginComputePass({ label: 'substrate-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg0);
    pass.setBindGroup(1, bg1);
    pass.dispatchWorkgroups(wgX, wgY);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    uniformBuffer.destroy();
  }

  // -- Passes 5-7 Stub (WebGPU): Copy tone to density ---------------------

  /**
   * Stub for passes 5-7 (seed, integrate, deposit).
   * Copies tone_r16f to density_r16f so that the resolve pass has valid
   * density input. The tone map (0 = dark, 1 = light) is inverted to
   * density (0 = no pigment, high = dense pigment).
   *
   * TODO: Implement full stroke synthesis with storage buffers and atomics
   * for proper seed placement, RK2 streamline integration, and nib SDF
   * deposit. This stub provides a reasonable fallback for field mediums.
   */
  private async gpuStubCopyToneToDensity(w: number, h: number): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;

    const toneEntry = pool.get('tone_r16f')!;
    const densityEntry = pool.get('density_r16f')!;

    // Both textures are r16float with the same dimensions — direct copy
    const encoder = device.createCommandEncoder({ label: 'stub-tone-to-density' });
    encoder.copyTextureToTexture(
      { texture: toneEntry.texture },
      { texture: densityEntry.texture },
      { width: w, height: h },
    );
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  }

  // -- Pass 8 (WebGPU): Resolve -------------------------------------------

  private async gpuPassResolve(
    w: number, h: number,
    medium: MediumParams,
    substrate: SubstrateParams,
    wgX: number, wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;
    const { pipeline } =
      this.getOrCreateComputePipeline('resolve', resolveWGSL);

    // ResolveUniforms: 16 floats + 1 u32 + 12 floats = 112 bytes (std140 aligned)
    const paramsData = new ArrayBuffer(112);
    const pv = new DataView(paramsData);
    pv.setFloat32(0, medium.toothContact, true);
    pv.setFloat32(4, medium.toothSoftness, true);
    pv.setFloat32(8, medium.maxDensity, true);
    pv.setFloat32(12, medium.absorptionR, true);
    pv.setFloat32(16, medium.absorptionG, true);
    pv.setFloat32(20, medium.absorptionB, true);
    pv.setFloat32(24, medium.sheen, true);
    pv.setFloat32(28, medium.sheenPower, true);
    pv.setFloat32(32, substrate.baseColor[0], true);
    pv.setFloat32(36, substrate.baseColor[1], true);
    pv.setFloat32(40, substrate.baseColor[2], true);
    pv.setFloat32(44, 0.0, true);  // _pad
    // Light direction: top-left at 45 degrees
    pv.setFloat32(48, -0.5, true);   // lightDirX
    pv.setFloat32(52, -0.5, true);   // lightDirY
    pv.setFloat32(56, 0.707, true);  // lightDirZ
    pv.setUint32(60, medium.colorModel, true);
    // Phase 4: color / palette uniforms
    pv.setFloat32(64, medium.paletteSnap, true);
    pv.setFloat32(68, medium.hueJitter, true);
    pv.setFloat32(72, medium.valueJitter, true);
    pv.setFloat32(76, medium.waxResist, true);
    // KM coefficients: approximate K from absorption, S inversely related
    const kmK_R = medium.absorptionR * 0.8;
    const kmK_G = medium.absorptionG * 0.8;
    const kmK_B = medium.absorptionB * 0.8;
    const kmS_R = 1.0 / (1.0 + medium.absorptionR);
    const kmS_G = 1.0 / (1.0 + medium.absorptionG);
    const kmS_B = 1.0 / (1.0 + medium.absorptionB);
    pv.setFloat32(80, kmK_R, true);
    pv.setFloat32(84, kmK_G, true);
    pv.setFloat32(88, kmK_B, true);
    pv.setFloat32(92, kmS_R, true);
    pv.setFloat32(96, kmS_G, true);
    pv.setFloat32(100, kmS_B, true);
    pv.setFloat32(104, 0.0, true);  // _pad2
    pv.setFloat32(108, 0.0, true);  // _pad3
    const uniformBuffer = this.createUniformBuffer('resolve-params', paramsData);

    const densityEntry = pool.get('density_r16f')!;
    const heightEntry = pool.get('substrate_r16f')!;
    const sourceEntry = pool.get('linear_rgba16f')!;
    const outputEntry = pool.get('resolved_rgba16f')!;

    // Resolve shader uses two bind groups:
    //   @group(0): binding 0 = params uniform, binding 1 = output storage
    //   @group(1): binding 0 = density, binding 1 = height, binding 2 = source
    const bg0Layout = pipeline.getBindGroupLayout(0);
    const bg1Layout = pipeline.getBindGroupLayout(1);

    const bg0 = device.createBindGroup({
      label: 'resolve-bg0',
      layout: bg0Layout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: outputEntry.view },
      ],
    });

    const bg1 = device.createBindGroup({
      label: 'resolve-bg1',
      layout: bg1Layout,
      entries: [
        { binding: 0, resource: densityEntry.view },
        { binding: 1, resource: heightEntry.view },
        { binding: 2, resource: sourceEntry.view },
      ],
    });

    const encoder = device.createCommandEncoder({ label: 'resolve-encoder' });
    const pass = encoder.beginComputePass({ label: 'resolve-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg0);
    pass.setBindGroup(1, bg1);
    pass.dispatchWorkgroups(wgX, wgY);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    uniformBuffer.destroy();
  }

  // -- Pass 9 (WebGPU): Wet (advection-diffusion) -------------------------

  private async gpuPassWet(
    w: number, h: number,
    medium: MediumParams,
    seed: number,
    iterations: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;
    const { pipeline, bindGroupLayout } =
      this.getOrCreateComputePipeline('wet', wetWGSL);

    const resolvedEntry = pool.get('resolved_rgba16f')!;
    const pingEntry = pool.get('wet_ping_rgba16f')!;

    // Ping-pong: even iterations read resolved → write ping,
    // odd iterations read ping → write resolved.
    for (let i = 0; i < iterations; i++) {
      const readEntry = (i % 2 === 0) ? resolvedEntry : pingEntry;
      const writeEntry = (i % 2 === 0) ? pingEntry : resolvedEntry;

      // WetUniforms: { wetness f32, bleedRadius f32, edgeDarkening f32,
      //   backrun f32, width u32, height u32, iteration u32, seed u32 }
      const paramsData = new ArrayBuffer(32);
      const pv = new DataView(paramsData);
      pv.setFloat32(0, medium.wetness, true);
      pv.setFloat32(4, medium.bleedRadius, true);
      pv.setFloat32(8, medium.edgeDarkening, true);
      pv.setFloat32(12, medium.backrun, true);
      pv.setUint32(16, w, true);
      pv.setUint32(20, h, true);
      pv.setUint32(24, i, true);
      pv.setUint32(28, seed >>> 0, true);
      const uniformBuffer = this.createUniformBuffer(`wet-params-${i}`, paramsData);

      const bindGroup = device.createBindGroup({
        label: `wet-bg-${i}`,
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: readEntry.view },
          { binding: 2, resource: writeEntry.view },
        ],
      });

      await this.dispatchCompute(`wet-iter${i}`, pipeline, bindGroup, wgX, wgY);
      uniformBuffer.destroy();
    }

    // After all iterations: if count is odd, the final result sits in
    // wet_ping_rgba16f. Copy it back to resolved_rgba16f so downstream
    // passes always read from resolved_rgba16f.
    if (iterations > 0 && iterations % 2 !== 0) {
      const copyEncoder = device.createCommandEncoder({ label: 'wet-final-copy' });
      copyEncoder.copyTextureToTexture(
        { texture: pingEntry.texture },
        { texture: resolvedEntry.texture },
        { width: w, height: h },
      );
      device.queue.submit([copyEncoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    }
  }

  // -- Pass 10 (WebGPU): Present ------------------------------------------

  private async gpuPassPresent(
    w: number, h: number,
    wgX: number, wgY: number,
  ): Promise<void> {
    const device = this.device!;
    const pool = this.texturePool!;
    const { pipeline } =
      this.getOrCreateComputePipeline('present', presentWGSL);

    // PresentUniforms: { gamma f32, exposure f32, contrast f32,
    //   width u32, height u32, _pad0 u32, _pad1 u32, _pad2 u32 }
    const paramsData = new ArrayBuffer(32);
    const pv = new DataView(paramsData);
    pv.setFloat32(0, 2.2, true);    // gamma (informational)
    pv.setFloat32(4, 0.0, true);    // exposure (EV stops, 0 = no change)
    pv.setFloat32(8, 1.0, true);    // contrast (1.0 = neutral)
    pv.setUint32(12, w, true);
    pv.setUint32(16, h, true);
    pv.setUint32(20, 0, true);
    pv.setUint32(24, 0, true);
    pv.setUint32(28, 0, true);
    const uniformBuffer = this.createUniformBuffer('present-params', paramsData);

    const inputEntry = pool.get('resolved_rgba16f')!;
    const outputEntry = pool.get('final_rgba8')!;

    // Present shader uses two bind groups:
    //   @group(0): binding 0 = params uniform, binding 1 = output storage
    //   @group(1): binding 0 = input texture
    const bg0Layout = pipeline.getBindGroupLayout(0);
    const bg1Layout = pipeline.getBindGroupLayout(1);

    const bg0 = device.createBindGroup({
      label: 'present-bg0',
      layout: bg0Layout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: outputEntry.view },
      ],
    });

    const bg1 = device.createBindGroup({
      label: 'present-bg1',
      layout: bg1Layout,
      entries: [
        { binding: 0, resource: inputEntry.view },
      ],
    });

    const encoder = device.createCommandEncoder({ label: 'present-encoder' });
    const pass = encoder.beginComputePass({ label: 'present-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg0);
    pass.setBindGroup(1, bg1);
    pass.dispatchWorkgroups(wgX, wgY);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    uniformBuffer.destroy();
  }

  // -- WebGPU read-back ---------------------------------------------------

  /**
   * Copy a pool texture to CPU and convert to RGBA8 ImageData.
   *
   * Handles every TextureFormat the pipeline uses:
   *   r16f   -> grayscale (0-255)
   *   rg16f  -> normalised tangent visualisation
   *   rgba16f -> linear-to-sRGB conversion
   *   rgba8  -> direct copy
   */
  private async gpuReadBack(
    slotId: string,
    w: number,
    h: number,
  ): Promise<ImageData> {
    const device = this.device!;
    const pool = this.texturePool!;
    const entry = pool.get(slotId)!;
    const format = entry.format;

    let bytesPerPixel: number;
    switch (format) {
      case 'rgba8':   bytesPerPixel = 4; break;
      case 'rgba16f': bytesPerPixel = 8; break;
      case 'r16f':    bytesPerPixel = 2; break;
      case 'rg16f':   bytesPerPixel = 4; break;
      case 'r32uint': bytesPerPixel = 4; break;
      default:        bytesPerPixel = 4; break;
    }

    // WebGPU requires bytesPerRow aligned to 256
    const unalignedBPR = w * bytesPerPixel;
    const bytesPerRow = Math.ceil(unalignedBPR / 256) * 256;
    const bufferSize = bytesPerRow * h;

    const staging = device.createBuffer({
      label: `readback-${slotId}`,
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = device.createCommandEncoder({ label: `readback-${slotId}-enc` });
    encoder.copyTextureToBuffer(
      { texture: entry.texture },
      { buffer: staging, bytesPerRow, rowsPerImage: h },
      { width: w, height: h },
    );
    device.queue.submit([encoder.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const raw = new Uint8Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();

    // Build RGBA8 ImageData
    const imageData = new ImageData(w, h);
    const px = imageData.data;

    if (format === 'r16f') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcOff = y * bytesPerRow + x * 2;
          const f16 = (raw[srcOff + 1] << 8) | raw[srcOff];
          const val = float16ToFloat32(f16);
          const b = clamp255(val * 255);
          const dst = (y * w + x) * 4;
          px[dst] = b;
          px[dst + 1] = b;
          px[dst + 2] = b;
          px[dst + 3] = 255;
        }
      }
    } else if (format === 'rgba16f') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcOff = y * bytesPerRow + x * 8;
          const dst = (y * w + x) * 4;
          for (let c = 0; c < 4; c++) {
            const f16 = (raw[srcOff + c * 2 + 1] << 8) | raw[srcOff + c * 2];
            const linear = float16ToFloat32(f16);
            const out = c < 3 ? linearToSRGB(linear) : linear;
            px[dst + c] = clamp255(out * 255);
          }
        }
      }
    } else if (format === 'rgba8') {
      for (let y = 0; y < h; y++) {
        const srcRow = y * bytesPerRow;
        const dstRow = y * w * 4;
        for (let i = 0; i < w * 4; i++) {
          px[dstRow + i] = raw[srcRow + i];
        }
      }
    } else if (format === 'rg16f') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcOff = y * bytesPerRow + x * 4;
          const dst = (y * w + x) * 4;
          const r = float16ToFloat32((raw[srcOff + 1] << 8) | raw[srcOff]);
          const g = float16ToFloat32((raw[srcOff + 3] << 8) | raw[srcOff + 2]);
          px[dst] = clamp255((r * 0.5 + 0.5) * 255);
          px[dst + 1] = clamp255((g * 0.5 + 0.5) * 255);
          px[dst + 2] = 0;
          px[dst + 3] = 255;
        }
      }
    }

    return imageData;
  }

  // ===========================================================================
  //  WebGL2 helpers
  // ===========================================================================

  /**
   * Retrieve (or compile and cache) a WebGL2 program for the given fragment
   * shader source.
   */
  private getOrCreateGLProgram(
    name: string,
    fragSource: string,
    uniformNames: string[],
  ): CachedGLProgram {
    const cached = this.programCache.get(name);
    if (cached) return cached;

    const gl = this.gl!;

    const vertShader = this.compileGLShader(gl.VERTEX_SHADER, fullscreenVert);
    const fragShader = this.compileGLShader(gl.FRAGMENT_SHADER, fragSource);

    const program = gl.createProgram();
    if (!program) throw new Error(`Failed to create GL program "${name}"`);

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      throw new Error(`GL link error (${name}): ${info}`);
    }

    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    const uniforms = new Map<string, WebGLUniformLocation>();
    for (const u of uniformNames) {
      const loc = gl.getUniformLocation(program, u);
      if (loc !== null) uniforms.set(u, loc);
    }

    const entry: CachedGLProgram = { program, uniforms };
    this.programCache.set(name, entry);
    return entry;
  }

  private compileGLShader(type: GLenum, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create GL shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`GL shader compile error: ${info}`);
    }

    return shader;
  }

  /**
   * Upload ImageData to a transient RGBA8 WebGL texture.
   * Caller must gl.deleteTexture() when done.
   */
  private uploadGLTexture(imageData: ImageData): WebGLTexture {
    const gl = this.gl!;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create GL upload texture');

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8,
      imageData.width, imageData.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE,
      imageData.data,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  /** Draw a fullscreen triangle (3 vertices, positions from gl_VertexID). */
  private drawFullscreenTriangle(): void {
    const gl = this.gl!;
    gl.bindVertexArray(this.glVAO!);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /**
   * Read back the contents of the currently bound FBO as RGBA8 ImageData.
   *
   * @param isFloat  true if the FBO attachment is a float format (reads as RGBA float)
   * @param channels 1 = R only (grayscale), 2 = RG, 4 = RGBA
   */
  private glReadFBO(
    w: number,
    h: number,
    isFloat: boolean,
    channels: number,
  ): ImageData {
    const gl = this.gl!;

    if (isFloat) {
      const buf = new Float32Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf);

      const imageData = new ImageData(w, h);
      const px = imageData.data;

      for (let y = 0; y < h; y++) {
        const srcY = h - 1 - y;
        for (let x = 0; x < w; x++) {
          const sOff = (srcY * w + x) * 4;
          const dOff = (y * w + x) * 4;

          if (channels === 1) {
            const v = clamp255(buf[sOff] * 255);
            px[dOff] = v;
            px[dOff + 1] = v;
            px[dOff + 2] = v;
            px[dOff + 3] = 255;
          } else if (channels === 2) {
            px[dOff] = clamp255((buf[sOff] * 0.5 + 0.5) * 255);
            px[dOff + 1] = clamp255((buf[sOff + 1] * 0.5 + 0.5) * 255);
            px[dOff + 2] = 0;
            px[dOff + 3] = 255;
          } else {
            for (let c = 0; c < 3; c++) {
              px[dOff + c] = clamp255(linearToSRGB(buf[sOff + c]) * 255);
            }
            px[dOff + 3] = clamp255(buf[sOff + 3] * 255);
          }
        }
      }
      return imageData;

    } else {
      const raw = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);

      const flipped = new Uint8ClampedArray(w * h * 4);
      const rowSize = w * 4;
      for (let y = 0; y < h; y++) {
        const srcRow = (h - 1 - y) * rowSize;
        const dstRow = y * rowSize;
        for (let i = 0; i < rowSize; i++) {
          flipped[dstRow + i] = raw[srcRow + i];
        }
      }
      return new ImageData(flipped, w, h);
    }
  }

  // ===========================================================================
  //  WebGL2 render path
  // ===========================================================================

  private async renderWebGL2(
    source: ImageData,
    w: number,
    h: number,
    exposure: number,
    bilateralRadius: number,
    toneLevels: number,
    sigmaRange: number,
    etfIterations: number,
    fdogSigma1: number,
    fdogSigma2: number,
    fdogTau: number,
    fdogPhi: number,
    fdogSamples: number,
    medium: MediumParams,
    substrate: SubstrateParams,
    _technique: TechniqueParams,
    seed: number,
    timings: Record<string, number>,
  ): Promise<ImageData> {
    const gl = this.gl!;
    const pool = this.glTexturePool!;

    // Upload source image as a transient RGBA8 texture
    const sourceTexture = this.uploadGLTexture(source);

    gl.viewport(0, 0, w, h);

    // -- Pass 0: Ingest ---------------------------------------------------
    let t = performance.now();
    this.gl2PassIngest(sourceTexture, w, h, exposure);
    timings['ingest'] = performance.now() - t;

    // -- Pass 1: Scharr ---------------------------------------------------
    t = performance.now();
    this.gl2PassScharr(w, h);
    timings['scharr'] = performance.now() - t;

    // -- Pass 2: ETF (ping-pong) ------------------------------------------
    t = performance.now();
    this.gl2PassETF(w, h, etfIterations);
    timings['etf'] = performance.now() - t;

    // -- Pass 3: Tone -----------------------------------------------------
    t = performance.now();
    this.gl2PassTone(w, h, bilateralRadius, toneLevels, sigmaRange);
    timings['tone'] = performance.now() - t;

    // -- Pass 4: FDoG -----------------------------------------------------
    t = performance.now();
    this.gl2PassFDoG(w, h, fdogSigma1, fdogSigma2, fdogTau, fdogPhi, fdogSamples);
    timings['fdog'] = performance.now() - t;

    // -- Substrate: procedural paper heightmap ----------------------------
    t = performance.now();
    this.glPassSubstrate(w, h, substrate, seed);
    timings['substrate'] = performance.now() - t;

    // -- Passes 5-7: Stub (copy tone to density) --------------------------
    // TODO: Full stroke synthesis. For now, blit tone_r16f to density_r16f.
    t = performance.now();
    this.glStubCopyToneToDensity(w, h);
    timings['seed+integrate+deposit'] = performance.now() - t;

    // -- Pass 8: Resolve --------------------------------------------------
    t = performance.now();
    this.glPassResolve(w, h, medium, substrate);
    timings['resolve'] = performance.now() - t;

    // -- Pass 9: Wet (skip if wetness === 0) ------------------------------
    if (medium.wetness > 0) {
      t = performance.now();
      const wetIterations = Math.min(this.tierSettings.wetIterations, 4);
      this.glPassWet(w, h, medium, seed, wetIterations);
      timings['wet'] = performance.now() - t;
    }

    // -- Pass 10: Present -------------------------------------------------
    t = performance.now();
    this.glPassPresent(w, h);
    timings['present'] = performance.now() - t;

    // -- Read back --------------------------------------------------------
    t = performance.now();
    const finalEntry = pool.get('final_rgba8')!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, finalEntry.fbo);
    const result = this.glReadFBO(w, h, false, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    timings['readback'] = performance.now() - t;

    // Clean up transient source texture
    gl.deleteTexture(sourceTexture);

    return result;
  }

  // -- Pass 0 (GL): Ingest ------------------------------------------------

  private gl2PassIngest(
    sourceTexture: WebGLTexture,
    w: number, h: number,
    exposure: number,
  ): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'ingest', ingestFrag, ['uTexture', 'uExposure'],
    );
    const outEntry = pool.get('linear_rgba16f')!;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outEntry.fbo);
    gl.viewport(0, 0, w, h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    const texLoc = uniforms.get('uTexture');
    if (texLoc) gl.uniform1i(texLoc, 0);

    const expLoc = uniforms.get('uExposure');
    if (expLoc) gl.uniform1f(expLoc, exposure);

    this.drawFullscreenTriangle();
  }

  // -- Pass 1 (GL): Scharr ------------------------------------------------

  private gl2PassScharr(w: number, h: number): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'scharr', scharrFrag, ['uTexture', 'uTexelSize'],
    );

    // Scharr writes vec4(Jxx, Jxy, Jyy, lum) into an rgba16f target.
    pool.allocate('structure_rgba16f', w, h, 'rgba16f');
    const outEntry = pool.get('structure_rgba16f')!;
    const linearEntry = pool.get('linear_rgba16f')!;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outEntry.fbo);
    gl.viewport(0, 0, w, h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, linearEntry.texture);
    const texLoc = uniforms.get('uTexture');
    if (texLoc) gl.uniform1i(texLoc, 0);

    const tsLoc = uniforms.get('uTexelSize');
    if (tsLoc) gl.uniform2f(tsLoc, 1.0 / w, 1.0 / h);

    this.drawFullscreenTriangle();
  }

  // -- Pass 2 (GL): ETF (ping-pong) ---------------------------------------

  private gl2PassETF(w: number, h: number, iterations: number): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'etf', etfFrag,
      ['uStructure', 'uPrevETF', 'uTexelSize', 'uKernelRadius'],
    );

    const structureEntry = pool.get('structure_rgba16f')!;
    const etfA = pool.get('etf_rg16f')!;
    const etfB = pool.get('etf_rg16f_prev')!;

    // Clear both ETF FBOs to zero
    gl.bindFramebuffer(gl.FRAMEBUFFER, etfA.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, etfB.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const kernelRadius = 2;

    for (let i = 0; i < iterations; i++) {
      const readEntry = (i % 2 === 0) ? etfA : etfB;
      const writeEntry = (i % 2 === 0) ? etfB : etfA;

      gl.useProgram(program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeEntry.fbo);
      gl.viewport(0, 0, w, h);

      // Unit 0: structure tensor
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, structureEntry.texture);
      const sLoc = uniforms.get('uStructure');
      if (sLoc) gl.uniform1i(sLoc, 0);

      // Unit 1: previous ETF
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, readEntry.texture);
      const pLoc = uniforms.get('uPrevETF');
      if (pLoc) gl.uniform1i(pLoc, 1);

      const tsLoc = uniforms.get('uTexelSize');
      if (tsLoc) gl.uniform2f(tsLoc, 1.0 / w, 1.0 / h);

      const krLoc = uniforms.get('uKernelRadius');
      if (krLoc) gl.uniform1i(krLoc, kernelRadius);

      this.drawFullscreenTriangle();
    }

    // Ensure result is in etfA (etf_rg16f). If iteration count is odd,
    // the final write went to etfA already (odd-1 is even, read A write B,
    // wait... let's think: i=0 even => read A, write B. i=1 odd => read B, write A.
    // So after 1 iteration result is in B. After 2 iterations result is in A.
    // After 3 iterations result is in B. So odd count => result in B.
    if (iterations > 0 && iterations % 2 !== 0) {
      // Result is in B, blit to A
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, etfB.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, etfA.fbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }
  }

  // -- Pass 3 (GL): Tone --------------------------------------------------

  private gl2PassTone(
    w: number, h: number,
    radius: number, levels: number, sigmaRange: number,
  ): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'tone', toneFrag,
      ['uTexture', 'uTexelSize', 'uRadius', 'uLevels', 'uSigmaRange'],
    );

    const linearEntry = pool.get('linear_rgba16f')!;
    const outEntry = pool.get('tone_r16f')!;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outEntry.fbo);
    gl.viewport(0, 0, w, h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, linearEntry.texture);
    const texLoc = uniforms.get('uTexture');
    if (texLoc) gl.uniform1i(texLoc, 0);

    const tsLoc = uniforms.get('uTexelSize');
    if (tsLoc) gl.uniform2f(tsLoc, 1.0 / w, 1.0 / h);

    const rLoc = uniforms.get('uRadius');
    if (rLoc) gl.uniform1i(rLoc, radius);

    const lLoc = uniforms.get('uLevels');
    if (lLoc) gl.uniform1i(lLoc, levels);

    const srLoc = uniforms.get('uSigmaRange');
    if (srLoc) gl.uniform1f(srLoc, sigmaRange);

    this.drawFullscreenTriangle();
  }

  // -- Pass 4 (GL): FDoG --------------------------------------------------

  private gl2PassFDoG(
    w: number, h: number,
    sigma1: number, sigma2: number,
    tau: number, phi: number, samples: number,
  ): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'fdog', fdogFrag,
      ['uTone', 'uETF', 'uTexelSize', 'uSigma1', 'uSigma2', 'uTau', 'uPhi', 'uSamples'],
    );

    const toneEntry = pool.get('tone_r16f')!;
    const etfEntry = pool.get('etf_rg16f')!;
    const outEntry = pool.get('edges_r16f')!;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outEntry.fbo);
    gl.viewport(0, 0, w, h);

    // Unit 0: tone map
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, toneEntry.texture);
    const tLoc = uniforms.get('uTone');
    if (tLoc) gl.uniform1i(tLoc, 0);

    // Unit 1: ETF
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, etfEntry.texture);
    const eLoc = uniforms.get('uETF');
    if (eLoc) gl.uniform1i(eLoc, 1);

    const tsLoc = uniforms.get('uTexelSize');
    if (tsLoc) gl.uniform2f(tsLoc, 1.0 / w, 1.0 / h);

    const s1Loc = uniforms.get('uSigma1');
    if (s1Loc) gl.uniform1f(s1Loc, sigma1);

    const s2Loc = uniforms.get('uSigma2');
    if (s2Loc) gl.uniform1f(s2Loc, sigma2);

    const tauLoc = uniforms.get('uTau');
    if (tauLoc) gl.uniform1f(tauLoc, tau);

    const phiLoc = uniforms.get('uPhi');
    if (phiLoc) gl.uniform1f(phiLoc, phi);

    const sampLoc = uniforms.get('uSamples');
    if (sampLoc) gl.uniform1i(sampLoc, samples);

    this.drawFullscreenTriangle();
  }

  // -- Substrate (GL): Procedural paper heightmap --------------------------

  private glPassSubstrate(
    w: number, h: number,
    substrate: SubstrateParams,
    seed: number,
  ): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'substrate', substrateFrag,
      ['uHeightScale', 'uGrainFreqX', 'uGrainFreqY',
       'uFiberAmount', 'uFiberAngle', 'uSeed'],
    );

    const outEntry = pool.get('substrate_r16f')!;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outEntry.fbo);
    gl.viewport(0, 0, w, h);

    const hsLoc = uniforms.get('uHeightScale');
    if (hsLoc) gl.uniform1f(hsLoc, substrate.heightScale);

    const gfxLoc = uniforms.get('uGrainFreqX');
    if (gfxLoc) gl.uniform1f(gfxLoc, substrate.grainFreq[0]);

    const gfyLoc = uniforms.get('uGrainFreqY');
    if (gfyLoc) gl.uniform1f(gfyLoc, substrate.grainFreq[1]);

    const faLoc = uniforms.get('uFiberAmount');
    if (faLoc) gl.uniform1f(faLoc, substrate.fiberAmount);

    const fangLoc = uniforms.get('uFiberAngle');
    if (fangLoc) gl.uniform1f(fangLoc, substrate.fiberAngle);

    const seedLoc = uniforms.get('uSeed');
    if (seedLoc) gl.uniform1ui(seedLoc, seed >>> 0);

    this.drawFullscreenTriangle();
  }

  // -- Passes 5-7 Stub (GL): Copy tone to density -------------------------

  /**
   * Stub for passes 5-7. Blits tone_r16f to density_r16f.
   * TODO: Full stroke synthesis for stroke and hybrid mediums.
   */
  private glStubCopyToneToDensity(w: number, h: number): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;

    const toneEntry = pool.get('tone_r16f')!;
    const densityEntry = pool.get('density_r16f')!;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, toneEntry.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, densityEntry.fbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  // -- Pass 8 (GL): Resolve -----------------------------------------------

  private glPassResolve(
    w: number, h: number,
    medium: MediumParams,
    substrate: SubstrateParams,
  ): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'resolve', resolveFrag,
      ['uDensityTex', 'uHeightTex', 'uSourceTex',
       'uToothContact', 'uToothSoftness',
       'uMaxDensity', 'uAbsorptionR', 'uAbsorptionG', 'uAbsorptionB',
       'uSheen', 'uSheenPower',
       'uBaseColorR', 'uBaseColorG', 'uBaseColorB',
       'uLightDirX', 'uLightDirY', 'uLightDirZ',
       'uColorModel',
       'uPaletteSnap', 'uHueJitter', 'uValueJitter', 'uWaxResist',
       'uKmK_R', 'uKmK_G', 'uKmK_B',
       'uKmS_R', 'uKmS_G', 'uKmS_B'],
    );

    const densityEntry = pool.get('density_r16f')!;
    const heightEntry = pool.get('substrate_r16f')!;
    const sourceEntry = pool.get('linear_rgba16f')!;
    const outEntry = pool.get('resolved_rgba16f')!;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outEntry.fbo);
    gl.viewport(0, 0, w, h);

    // Unit 0: density map
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, densityEntry.texture);
    const dLoc = uniforms.get('uDensityTex');
    if (dLoc) gl.uniform1i(dLoc, 0);

    // Unit 1: height map
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heightEntry.texture);
    const hLoc = uniforms.get('uHeightTex');
    if (hLoc) gl.uniform1i(hLoc, 1);

    // Unit 2: source image
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sourceEntry.texture);
    const sLoc = uniforms.get('uSourceTex');
    if (sLoc) gl.uniform1i(sLoc, 2);

    // Substrate interaction
    const tcLoc = uniforms.get('uToothContact');
    if (tcLoc) gl.uniform1f(tcLoc, medium.toothContact);

    const tsLoc = uniforms.get('uToothSoftness');
    if (tsLoc) gl.uniform1f(tsLoc, medium.toothSoftness);

    // Pigment deposition
    const mdLoc = uniforms.get('uMaxDensity');
    if (mdLoc) gl.uniform1f(mdLoc, medium.maxDensity);

    const arLoc = uniforms.get('uAbsorptionR');
    if (arLoc) gl.uniform1f(arLoc, medium.absorptionR);

    const agLoc = uniforms.get('uAbsorptionG');
    if (agLoc) gl.uniform1f(agLoc, medium.absorptionG);

    const abLoc = uniforms.get('uAbsorptionB');
    if (abLoc) gl.uniform1f(abLoc, medium.absorptionB);

    // Surface finish
    const shLoc = uniforms.get('uSheen');
    if (shLoc) gl.uniform1f(shLoc, medium.sheen);

    const spLoc = uniforms.get('uSheenPower');
    if (spLoc) gl.uniform1f(spLoc, medium.sheenPower);

    // Substrate base color (linear)
    const bcrLoc = uniforms.get('uBaseColorR');
    if (bcrLoc) gl.uniform1f(bcrLoc, substrate.baseColor[0]);

    const bcgLoc = uniforms.get('uBaseColorG');
    if (bcgLoc) gl.uniform1f(bcgLoc, substrate.baseColor[1]);

    const bcbLoc = uniforms.get('uBaseColorB');
    if (bcbLoc) gl.uniform1f(bcbLoc, substrate.baseColor[2]);

    // Light direction (top-left at 45 degrees)
    const ldxLoc = uniforms.get('uLightDirX');
    if (ldxLoc) gl.uniform1f(ldxLoc, -0.5);

    const ldyLoc = uniforms.get('uLightDirY');
    if (ldyLoc) gl.uniform1f(ldyLoc, -0.5);

    const ldzLoc = uniforms.get('uLightDirZ');
    if (ldzLoc) gl.uniform1f(ldzLoc, 0.707);

    // Color model
    const cmLoc = uniforms.get('uColorModel');
    if (cmLoc) gl.uniform1i(cmLoc, medium.colorModel);

    // Phase 4: color / palette uniforms
    const psLoc = uniforms.get('uPaletteSnap');
    if (psLoc) gl.uniform1f(psLoc, medium.paletteSnap);

    const hjLoc = uniforms.get('uHueJitter');
    if (hjLoc) gl.uniform1f(hjLoc, medium.hueJitter);

    const vjLoc = uniforms.get('uValueJitter');
    if (vjLoc) gl.uniform1f(vjLoc, medium.valueJitter);

    const wrLoc = uniforms.get('uWaxResist');
    if (wrLoc) gl.uniform1f(wrLoc, medium.waxResist);

    // KM coefficients: approximate K from absorption, S inversely related
    const kmK_R = medium.absorptionR * 0.8;
    const kmK_G = medium.absorptionG * 0.8;
    const kmK_B = medium.absorptionB * 0.8;
    const kmS_R = 1.0 / (1.0 + medium.absorptionR);
    const kmS_G = 1.0 / (1.0 + medium.absorptionG);
    const kmS_B = 1.0 / (1.0 + medium.absorptionB);

    const kkrLoc = uniforms.get('uKmK_R');
    if (kkrLoc) gl.uniform1f(kkrLoc, kmK_R);

    const kkgLoc = uniforms.get('uKmK_G');
    if (kkgLoc) gl.uniform1f(kkgLoc, kmK_G);

    const kkbLoc = uniforms.get('uKmK_B');
    if (kkbLoc) gl.uniform1f(kkbLoc, kmK_B);

    const ksrLoc = uniforms.get('uKmS_R');
    if (ksrLoc) gl.uniform1f(ksrLoc, kmS_R);

    const ksgLoc = uniforms.get('uKmS_G');
    if (ksgLoc) gl.uniform1f(ksgLoc, kmS_G);

    const ksbLoc = uniforms.get('uKmS_B');
    if (ksbLoc) gl.uniform1f(ksbLoc, kmS_B);

    this.drawFullscreenTriangle();

    // Unbind textures
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // -- Pass 9 (GL): Wet (advection-diffusion) -----------------------------

  private glPassWet(
    w: number, h: number,
    medium: MediumParams,
    seed: number,
    iterations: number,
  ): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'wet', wetFrag,
      ['uInputTex', 'uWetness', 'uBleedRadius', 'uEdgeDarkening',
       'uBackrun', 'uWidth', 'uHeight', 'uIteration', 'uSeed'],
    );

    const resolvedEntry = pool.get('resolved_rgba16f')!;
    const pingEntry = pool.get('wet_ping_rgba16f')!;

    for (let i = 0; i < iterations; i++) {
      const readEntry = (i % 2 === 0) ? resolvedEntry : pingEntry;
      const writeEntry = (i % 2 === 0) ? pingEntry : resolvedEntry;

      gl.useProgram(program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeEntry.fbo);
      gl.viewport(0, 0, w, h);

      // Unit 0: input texture (previous iteration result)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readEntry.texture);
      const texLoc = uniforms.get('uInputTex');
      if (texLoc) gl.uniform1i(texLoc, 0);

      const wLoc = uniforms.get('uWetness');
      if (wLoc) gl.uniform1f(wLoc, medium.wetness);

      const brLoc = uniforms.get('uBleedRadius');
      if (brLoc) gl.uniform1f(brLoc, medium.bleedRadius);

      const edLoc = uniforms.get('uEdgeDarkening');
      if (edLoc) gl.uniform1f(edLoc, medium.edgeDarkening);

      const bkLoc = uniforms.get('uBackrun');
      if (bkLoc) gl.uniform1f(bkLoc, medium.backrun);

      const wiLoc = uniforms.get('uWidth');
      if (wiLoc) gl.uniform1i(wiLoc, w);

      const hiLoc = uniforms.get('uHeight');
      if (hiLoc) gl.uniform1i(hiLoc, h);

      const itLoc = uniforms.get('uIteration');
      if (itLoc) gl.uniform1i(itLoc, i);

      const sLoc = uniforms.get('uSeed');
      if (sLoc) gl.uniform1ui(sLoc, seed >>> 0);

      this.drawFullscreenTriangle();
    }

    // After all iterations: if count is odd, result is in wet_ping_rgba16f.
    // Blit it back to resolved_rgba16f so downstream passes read from there.
    if (iterations > 0 && iterations % 2 !== 0) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pingEntry.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolvedEntry.fbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    // Unbind
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // -- Pass 10 (GL): Present ----------------------------------------------

  private glPassPresent(w: number, h: number): void {
    const gl = this.gl!;
    const pool = this.glTexturePool!;
    const { program, uniforms } = this.getOrCreateGLProgram(
      'present', presentFrag,
      ['uTexture', 'uGamma', 'uExposure', 'uContrast'],
    );

    const resolvedEntry = pool.get('resolved_rgba16f')!;
    const outEntry = pool.get('final_rgba8')!;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outEntry.fbo);
    gl.viewport(0, 0, w, h);

    // Unit 0: resolved linear color
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resolvedEntry.texture);
    const texLoc = uniforms.get('uTexture');
    if (texLoc) gl.uniform1i(texLoc, 0);

    const gLoc = uniforms.get('uGamma');
    if (gLoc) gl.uniform1f(gLoc, 2.2);

    const eLoc = uniforms.get('uExposure');
    if (eLoc) gl.uniform1f(eLoc, 0.0);

    const cLoc = uniforms.get('uContrast');
    if (cLoc) gl.uniform1f(cLoc, 1.0);

    this.drawFullscreenTriangle();

    // Unbind
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}

// =============================================================================
//  Standalone utility functions
// =============================================================================

/**
 * Decode an IEEE 754 half-precision (float16) bit pattern stored in a u16
 * into a JavaScript number (float64).
 *
 * Layout: 1 sign | 5 exponent | 10 mantissa
 */
function float16ToFloat32(bits: number): number {
  const sign = (bits >>> 15) & 1;
  const exp = (bits >>> 10) & 0x1f;
  const mant = bits & 0x3ff;

  let val: number;
  if (exp === 0) {
    // Sub-normal or zero
    val = (mant / 1024) * Math.pow(2, -14);
  } else if (exp === 0x1f) {
    val = mant === 0 ? Infinity : NaN;
  } else {
    val = (1 + mant / 1024) * Math.pow(2, exp - 15);
  }

  return sign ? -val : val;
}

/**
 * Linear light to sRGB gamma (IEC 61966-2-1 OETF).
 */
function linearToSRGB(c: number): number {
  if (c <= 0.0031308) {
    return 12.92 * c;
  }
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

/** Clamp a floating value to [0, 255] and round to an integer. */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
