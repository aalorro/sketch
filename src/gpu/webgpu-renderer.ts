// WebGPU renderer implementation
// Uses navigator.gpu API with WGSL compute shaders for image processing.

import type { GPURenderer } from './renderer';

// Vite raw imports for WGSL shaders
import sobelWGSL from './shaders/sobel.wgsl?raw';
import grayscaleWGSL from './shaders/grayscale.wgsl?raw';
import colorAdjustWGSL from './shaders/color-adjust.wgsl?raw';
import invertWGSL from './shaders/invert.wgsl?raw';
import smoothingWGSL from './shaders/smoothing.wgsl?raw';
import textureBlendWGSL from './shaders/texture-blend.wgsl?raw';

/** Pipeline cache entry */
interface CachedPipeline {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class WebGPURenderer implements GPURenderer {
  readonly type = 'webgpu' as const;

  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;

  // Lazy pipeline cache, keyed by shader name
  private pipelineCache = new Map<string, CachedPipeline>();

  async init(): Promise<boolean> {
    try {
      if (!navigator.gpu) {
        return false;
      }

      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!adapter) {
        return false;
      }

      const device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
          maxBufferSize: adapter.limits.maxBufferSize,
        },
      });

      // Listen for device loss
      device.lost.then((info) => {
        console.error('[WebGPU] Device lost:', info.message);
        this.device = null;
      });

      this.adapter = adapter;
      this.device = device;
      return true;
    } catch (err) {
      console.warn('[WebGPU] init failed:', err);
      return false;
    }
  }

  /**
   * Get or create a compute pipeline for a given shader.
   */
  private getOrCreatePipeline(name: string, shaderCode: string): CachedPipeline {
    const cached = this.pipelineCache.get(name);
    if (cached) return cached;

    const device = this.device!;

    const shaderModule = device.createShaderModule({
      label: `${name}-shader`,
      code: shaderCode,
    });

    const pipeline = device.createComputePipeline({
      label: `${name}-pipeline`,
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    const bindGroupLayout = pipeline.getBindGroupLayout(0);

    const entry: CachedPipeline = { pipeline, bindGroupLayout };
    this.pipelineCache.set(name, entry);
    return entry;
  }

  /**
   * Upload ImageData to a GPU storage buffer as packed u32 RGBA values.
   */
  private createInputBuffer(imageData: ImageData): GPUBuffer {
    const device = this.device!;
    const pixelCount = imageData.width * imageData.height;
    const data = imageData.data;

    // Pack RGBA bytes into u32 values (little-endian: R in lowest byte)
    const packed = new Uint32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      packed[i] =
        data[offset] |
        (data[offset + 1] << 8) |
        (data[offset + 2] << 16) |
        (data[offset + 3] << 24);
    }

    const buffer = device.createBuffer({
      label: 'input-buffer',
      size: packed.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(buffer.getMappedRange()).set(packed);
    buffer.unmap();

    return buffer;
  }

  /**
   * Create an output storage buffer of given pixel count.
   */
  private createOutputBuffer(pixelCount: number): GPUBuffer {
    const device = this.device!;
    return device.createBuffer({
      label: 'output-buffer',
      size: pixelCount * 4, // u32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
  }

  /**
   * Create a staging buffer for reading back output from GPU.
   */
  private createStagingBuffer(pixelCount: number): GPUBuffer {
    const device = this.device!;
    return device.createBuffer({
      label: 'staging-buffer',
      size: pixelCount * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Read the output buffer back into an ImageData.
   */
  private async readOutputBuffer(
    outputBuffer: GPUBuffer,
    stagingBuffer: GPUBuffer,
    width: number,
    height: number
  ): Promise<ImageData> {
    const device = this.device!;
    const pixelCount = width * height;

    // Copy output buffer to staging buffer
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      outputBuffer,
      0,
      stagingBuffer,
      0,
      pixelCount * 4
    );
    device.queue.submit([commandEncoder.finish()]);

    // Map staging buffer and read data
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Uint32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    // Unpack u32 back to RGBA bytes
    const imageData = new ImageData(width, height);
    const pixels = imageData.data;
    for (let i = 0; i < pixelCount; i++) {
      const packed = resultData[i];
      const offset = i * 4;
      pixels[offset] = packed & 0xff;
      pixels[offset + 1] = (packed >> 8) & 0xff;
      pixels[offset + 2] = (packed >> 16) & 0xff;
      pixels[offset + 3] = (packed >> 24) & 0xff;
    }

    return imageData;
  }

  /**
   * Run a standard compute shader with a single input buffer, output buffer, and uniform params.
   */
  private async runStandardCompute(
    name: string,
    shaderCode: string,
    input: ImageData,
    uniformData: ArrayBuffer
  ): Promise<ImageData> {
    if (!this.device) throw new Error('WebGPU device not initialized');

    const device = this.device;
    const { pipeline, bindGroupLayout } = this.getOrCreatePipeline(name, shaderCode);
    const pixelCount = input.width * input.height;

    // Create buffers
    const inputBuffer = this.createInputBuffer(input);
    const outputBuffer = this.createOutputBuffer(pixelCount);
    const stagingBuffer = this.createStagingBuffer(pixelCount);

    // Create uniform buffer
    const uniformBuffer = device.createBuffer({
      label: `${name}-uniform`,
      size: Math.max(uniformData.byteLength, 16), // minimum 16 bytes for alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // Create bind group
    const bindGroup = device.createBindGroup({
      label: `${name}-bind-group`,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });

    // Dispatch compute
    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(input.width / 8),
      Math.ceil(input.height / 8)
    );
    pass.end();
    device.queue.submit([commandEncoder.finish()]);

    // Read back
    const result = await this.readOutputBuffer(
      outputBuffer,
      stagingBuffer,
      input.width,
      input.height
    );

    // Clean up buffers
    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();
    uniformBuffer.destroy();

    return result;
  }

  async sobel(input: ImageData): Promise<ImageData> {
    // Params: width (u32), height (u32) -> 8 bytes, padded to 8
    const params = new ArrayBuffer(8);
    const view = new DataView(params);
    view.setUint32(0, input.width, true);
    view.setUint32(4, input.height, true);

    return this.runStandardCompute('sobel', sobelWGSL, input, params);
  }

  async grayscale(input: ImageData): Promise<ImageData> {
    const params = new ArrayBuffer(8);
    const view = new DataView(params);
    view.setUint32(0, input.width, true);
    view.setUint32(4, input.height, true);

    return this.runStandardCompute('grayscale', grayscaleWGSL, input, params);
  }

  async colorAdjust(
    input: ImageData,
    contrast: number,
    saturation: number,
    hueShift: number
  ): Promise<ImageData> {
    // Params: width (u32), height (u32), contrast (f32), saturation (f32), hueShift (f32), pad (f32)
    const params = new ArrayBuffer(24);
    const view = new DataView(params);
    view.setUint32(0, input.width, true);
    view.setUint32(4, input.height, true);
    view.setFloat32(8, contrast, true);
    view.setFloat32(12, saturation, true);
    view.setFloat32(16, hueShift, true);
    view.setFloat32(20, 0.0, true); // padding

    return this.runStandardCompute('colorAdjust', colorAdjustWGSL, input, params);
  }

  async invert(input: ImageData): Promise<ImageData> {
    const params = new ArrayBuffer(8);
    const view = new DataView(params);
    view.setUint32(0, input.width, true);
    view.setUint32(4, input.height, true);

    return this.runStandardCompute('invert', invertWGSL, input, params);
  }

  async smooth(input: ImageData, radius: number): Promise<ImageData> {
    // Params: width (u32), height (u32), radius (u32), pad (u32)
    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setUint32(0, input.width, true);
    view.setUint32(4, input.height, true);
    view.setUint32(8, Math.round(radius), true);
    view.setUint32(12, 0, true); // padding

    return this.runStandardCompute('smoothing', smoothingWGSL, input, params);
  }

  async textureBlend(
    input: ImageData,
    texture: ImageData,
    opacity: number
  ): Promise<ImageData> {
    if (!this.device) throw new Error('WebGPU device not initialized');

    const device = this.device;
    const { pipeline, bindGroupLayout } = this.getOrCreatePipeline(
      'textureBlend',
      textureBlendWGSL
    );
    const pixelCount = input.width * input.height;

    // Create buffers -- textureBlend has 4 bindings: input, texture, output, params
    const inputBuffer = this.createInputBuffer(input);
    const textureBuffer = this.createInputBuffer(texture);
    const outputBuffer = this.createOutputBuffer(pixelCount);
    const stagingBuffer = this.createStagingBuffer(pixelCount);

    // Params: width (u32), height (u32), opacity (f32), pad (f32)
    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setUint32(0, input.width, true);
    view.setUint32(4, input.height, true);
    view.setFloat32(8, opacity, true);
    view.setFloat32(12, 0.0, true);

    const uniformBuffer = device.createBuffer({
      label: 'textureBlend-uniform',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, params);

    // Create bind group with 4 entries
    const bindGroup = device.createBindGroup({
      label: 'textureBlend-bind-group',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: textureBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
        { binding: 3, resource: { buffer: uniformBuffer } },
      ],
    });

    // Dispatch
    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(input.width / 8),
      Math.ceil(input.height / 8)
    );
    pass.end();
    device.queue.submit([commandEncoder.finish()]);

    // Read back
    const result = await this.readOutputBuffer(
      outputBuffer,
      stagingBuffer,
      input.width,
      input.height
    );

    // Clean up
    inputBuffer.destroy();
    textureBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();
    uniformBuffer.destroy();

    return result;
  }

  destroy(): void {
    if (this.device) {
      this.pipelineCache.clear();
      this.device.destroy();
      this.device = null;
      this.adapter = null;
    }
  }
}
