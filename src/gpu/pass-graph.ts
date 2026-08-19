/**
 * Pass Graph — directed acyclic graph describing the multi-pass physics
 * rendering pipeline. Determines execution order and texture allocation
 * based on declared dependencies between passes.
 */

import { PassId, TextureSlot, TextureFormat } from '../types-v2';

export interface PassNode {
  id: PassId;
  /** Texture slot IDs this pass reads from */
  inputs: string[];
  /** Texture slot IDs this pass writes to */
  outputs: string[];
  /** Number of iterations (>1 for ping-pong passes like ETF, wet) */
  iterations: number;
  /** True for optional passes (e.g. wet, skipped for dry media) */
  optional: boolean;
  /** Runtime toggle — disabled passes are skipped in execution order */
  enabled: boolean;
}

export class PassGraph {
  private passes: PassNode[] = [];
  private slots: Map<string, TextureSlot> = new Map();

  /** Register a texture slot that passes can reference. */
  addSlot(slot: TextureSlot): void {
    this.slots.set(slot.id, slot);
  }

  /** Add a pass node to the graph. */
  addPass(pass: PassNode): void {
    this.passes.push(pass);
  }

  /**
   * Enable or disable a pass at runtime.
   * Disabled passes (and their unique outputs) are excluded from execution.
   */
  enablePass(id: PassId, enabled: boolean): void {
    const pass = this.passes.find(p => p.id === id);
    if (pass) {
      pass.enabled = enabled;
    }
  }

  /**
   * Return passes in dependency order, skipping disabled passes.
   *
   * Uses topological sort: a pass is ready to execute when all of its
   * input slots have been produced by a preceding enabled pass (or are
   * source slots with no producer in the graph).
   */
  getExecutionOrder(): PassNode[] {
    const enabled = this.passes.filter(p => p.enabled);

    // Build a set of slot IDs produced by enabled passes
    const producedSlots = new Set<string>();
    for (const pass of enabled) {
      for (const output of pass.outputs) {
        producedSlots.add(output);
      }
    }

    // Topological sort via Kahn's algorithm
    // in-degree = number of input slots that must be produced by another enabled pass
    const inDegree = new Map<PassId, number>();
    const dependents = new Map<string, PassId[]>(); // slot -> passes that need it

    for (const pass of enabled) {
      let degree = 0;
      for (const input of pass.inputs) {
        // Only count inputs that are produced by some other enabled pass
        if (producedSlots.has(input)) {
          degree++;
          if (!dependents.has(input)) {
            dependents.set(input, []);
          }
          dependents.get(input)!.push(pass.id);
        }
      }
      inDegree.set(pass.id, degree);
    }

    const queue: PassNode[] = [];
    const result: PassNode[] = [];

    // Seed with zero-degree passes
    for (const pass of enabled) {
      if (inDegree.get(pass.id)! === 0) {
        queue.push(pass);
      }
    }

    while (queue.length > 0) {
      const pass = queue.shift()!;
      result.push(pass);

      // For each output slot of this pass, decrement dependents
      for (const output of pass.outputs) {
        const deps = dependents.get(output);
        if (!deps) continue;
        for (const depId of deps) {
          const newDegree = inDegree.get(depId)! - 1;
          inDegree.set(depId, newDegree);
          if (newDegree === 0) {
            const depPass = enabled.find(p => p.id === depId)!;
            queue.push(depPass);
          }
        }
      }
    }

    // Sanity check: if result length !== enabled length, there is a cycle
    if (result.length !== enabled.length) {
      throw new Error(
        `Pass graph has a cycle or unresolvable dependency. ` +
        `Resolved ${result.length} of ${enabled.length} enabled passes.`
      );
    }

    return result;
  }

  /**
   * Return only the texture slots required by currently enabled passes.
   * A slot is required if it appears as an input or output of any enabled pass.
   */
  getRequiredSlots(): TextureSlot[] {
    const needed = new Set<string>();
    for (const pass of this.passes) {
      if (!pass.enabled) continue;
      for (const id of pass.inputs) needed.add(id);
      for (const id of pass.outputs) needed.add(id);
    }
    const result: TextureSlot[] = [];
    for (const id of needed) {
      const slot = this.slots.get(id);
      if (slot) result.push(slot);
    }
    return result;
  }

  /**
   * Build the default Phase 1 (foundation) pass graph covering passes 0-4:
   *
   *   Pass 0 (ingest):    source_rgba8 -> linear_rgba16f
   *   Pass 1 (structure): linear_rgba16f -> structure_rg16f
   *   Pass 2 (etf):       structure_rg16f -> etf_rg16f  (3 iterations)
   *   Pass 3 (tone):      linear_rgba16f -> tone_r16f
   *   Pass 4 (edges):     tone_r16f + etf_rg16f -> edges_r16f
   */
  static buildFoundation(): PassGraph {
    const graph = new PassGraph();

    // ── Texture slots ─────────────────────────────────────────────────────

    graph.addSlot({
      id: 'source_rgba8',
      format: 'rgba8',
      scale: 1.0,
      producedBy: 'ingest',
      consumedBy: ['ingest'],
    });

    graph.addSlot({
      id: 'linear_rgba16f',
      format: 'rgba16f',
      scale: 1.0,
      producedBy: 'ingest',
      consumedBy: ['structure', 'tone'],
    });

    graph.addSlot({
      id: 'structure_rg16f',
      format: 'rg16f',
      scale: 1.0,
      producedBy: 'structure',
      consumedBy: ['etf'],
    });

    graph.addSlot({
      id: 'etf_rg16f',
      format: 'rg16f',
      scale: 1.0,
      producedBy: 'etf',
      consumedBy: ['edges'],
    });

    graph.addSlot({
      id: 'tone_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'tone',
      consumedBy: ['edges'],
    });

    graph.addSlot({
      id: 'edges_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'edges',
      consumedBy: [],
    });

    // ── Pass nodes ────────────────────────────────────────────────────────

    graph.addPass({
      id: 'ingest',
      inputs: ['source_rgba8'],
      outputs: ['linear_rgba16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'structure',
      inputs: ['linear_rgba16f'],
      outputs: ['structure_rg16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'etf',
      inputs: ['structure_rg16f'],
      outputs: ['etf_rg16f'],
      iterations: 3,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'tone',
      inputs: ['linear_rgba16f'],
      outputs: ['tone_r16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'edges',
      inputs: ['tone_r16f', 'etf_rg16f'],
      outputs: ['edges_r16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    return graph;
  }

  /**
   * Build the full Phase 2+3 pass graph covering passes 0-10:
   *
   *   Pass 0  (ingest):    source_rgba8 -> linear_rgba16f
   *   Pass 1  (structure): linear_rgba16f -> structure_rg16f
   *   Pass 2  (etf):       structure_rg16f -> etf_rg16f  (3 iterations)
   *   Pass 3  (tone):      linear_rgba16f -> tone_r16f
   *   Pass 4  (edges):     tone_r16f + etf_rg16f -> edges_r16f
   *   Pass 5  (seed):      tone_r16f -> seeds_r16f
   *   Pass 6  (integrate): seeds_r16f + etf_rg16f -> strokes_r16f
   *   Pass 7  (deposit):   strokes_r16f -> density_r16f
   *   Pass 8  (resolve):   density_r16f + substrate_r16f + linear_rgba16f + tone_r16f -> resolved_rgba16f
   *   Pass 9  (wet):       resolved_rgba16f -> resolved_rgba16f (optional, disabled by default)
   *   Pass 10 (present):   resolved_rgba16f -> final_rgba8
   */
  static buildFull(): PassGraph {
    const graph = new PassGraph();

    // ── Texture slots ─────────────────────────────────────────────────────

    graph.addSlot({
      id: 'source_rgba8',
      format: 'rgba8',
      scale: 1.0,
      producedBy: 'ingest',
      consumedBy: ['ingest'],
    });

    graph.addSlot({
      id: 'linear_rgba16f',
      format: 'rgba16f',
      scale: 1.0,
      producedBy: 'ingest',
      consumedBy: ['structure', 'tone', 'resolve'],
    });

    graph.addSlot({
      id: 'structure_rg16f',
      format: 'rg16f',
      scale: 1.0,
      producedBy: 'structure',
      consumedBy: ['etf'],
    });

    graph.addSlot({
      id: 'etf_rg16f',
      format: 'rg16f',
      scale: 1.0,
      producedBy: 'etf',
      consumedBy: ['edges', 'integrate'],
    });

    graph.addSlot({
      id: 'tone_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'tone',
      consumedBy: ['edges', 'seed', 'resolve'],
    });

    graph.addSlot({
      id: 'edges_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'edges',
      consumedBy: [],
    });

    // Substrate heightmap (persistent, regenerated when substrate changes)
    graph.addSlot({
      id: 'substrate_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'seed',
      consumedBy: ['resolve'],
    });

    // Seed buffer placeholder for graph ordering
    graph.addSlot({
      id: 'seeds_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'seed',
      consumedBy: ['integrate'],
    });

    // Stroke vertices placeholder for graph ordering
    graph.addSlot({
      id: 'strokes_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'integrate',
      consumedBy: ['deposit'],
    });

    // Density accumulation from deposit pass
    graph.addSlot({
      id: 'density_r16f',
      format: 'r16f',
      scale: 1.0,
      producedBy: 'deposit',
      consumedBy: ['resolve'],
    });

    // Resolved color
    graph.addSlot({
      id: 'resolved_rgba16f',
      format: 'rgba16f',
      scale: 1.0,
      producedBy: 'resolve',
      consumedBy: ['wet', 'present'],
    });

    // Final output
    graph.addSlot({
      id: 'final_rgba8',
      format: 'rgba8',
      scale: 1.0,
      producedBy: 'present',
      consumedBy: [],
    });

    // ── Pass nodes ────────────────────────────────────────────────────────

    graph.addPass({
      id: 'ingest',
      inputs: ['source_rgba8'],
      outputs: ['linear_rgba16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'structure',
      inputs: ['linear_rgba16f'],
      outputs: ['structure_rg16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'etf',
      inputs: ['structure_rg16f'],
      outputs: ['etf_rg16f'],
      iterations: 3,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'tone',
      inputs: ['linear_rgba16f'],
      outputs: ['tone_r16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'edges',
      inputs: ['tone_r16f', 'etf_rg16f'],
      outputs: ['edges_r16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'seed',
      inputs: ['tone_r16f'],
      outputs: ['seeds_r16f'],
      iterations: 1,
      optional: true,
      enabled: true,
    });

    graph.addPass({
      id: 'integrate',
      inputs: ['seeds_r16f', 'etf_rg16f'],
      outputs: ['strokes_r16f'],
      iterations: 1,
      optional: true,
      enabled: true,
    });

    graph.addPass({
      id: 'deposit',
      inputs: ['strokes_r16f'],
      outputs: ['density_r16f'],
      iterations: 1,
      optional: true,
      enabled: true,
    });

    graph.addPass({
      id: 'resolve',
      inputs: ['density_r16f', 'substrate_r16f', 'linear_rgba16f', 'tone_r16f'],
      outputs: ['resolved_rgba16f'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    graph.addPass({
      id: 'wet',
      inputs: ['resolved_rgba16f'],
      outputs: ['resolved_rgba16f'],
      iterations: 1,
      optional: true,
      enabled: false,
    });

    graph.addPass({
      id: 'present',
      inputs: ['resolved_rgba16f'],
      outputs: ['final_rgba8'],
      iterations: 1,
      optional: false,
      enabled: true,
    });

    return graph;
  }
}
