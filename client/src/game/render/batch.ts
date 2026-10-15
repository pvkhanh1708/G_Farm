import { BoundingInfo, Geometry, Matrix, Mesh, Scene, ShadowGenerator, Vector3 } from '@babylonjs/core';
import { PARCEL_PITCH } from '../config';

/**
 * Tiles draw through thin instances instead of one InstancedMesh (plus parent
 * nodes) each: a farm with hundreds of tiles otherwise spends most of every
 * frame walking nodes and submitting draws.
 *
 * Every instance lives in two batches:
 *  - a per-parcel batch (full detail, casts shadows) used while zoomed in, so
 *    whole off-screen parcels are frustum-culled;
 *  - a farm-wide batch (simplified model) used in the zoomed-out overview, where
 *    everything is on screen anyway: one draw call per crop/stage for the farm.
 * Batches have fixed bounding boxes, so instance updates never recompute them.
 */

export type Handle = number;

/**
 * A Geometry of its own for `target` that reuses the template's GPU vertex and
 * index buffers. Babylon stores thin-instance matrices on the geometry, so
 * batches must not share one, yet copying vertex data per batch would multiply
 * memory by the number of parcels.
 */
function shareGeometry(template: Mesh, target: Mesh, scene: Scene) {
  const src = template.geometry!;
  const geo = new Geometry(`${target.name}-geo`, scene);
  const vertices = src.getTotalVertices();
  for (const kind of src.getVerticesDataKinds()) geo.setVerticesBuffer(src.getVertexBuffer(kind)!, vertices, false);
  const index = src.getIndexBuffer()!;
  geo.setIndexBuffer(index, vertices, src.getTotalIndices(), index.is32Bits);
  geo.applyToMesh(target);
}

class ThinBatch {
  readonly mesh: Mesh;
  private buf = new Float32Array(16 * 8);
  private slots: Handle[] = [];
  private slotOf = new Map<Handle, number>();
  private resized = true;
  private dirty = false;
  private visible = true;

  constructor(scene: Scene, name: string, template: Mesh, bounds: BoundingInfo, private batches: TileBatches, private mirror: ThinBatch | null) {
    const m = new Mesh(name, scene);
    shareGeometry(template, m, scene);
    m.material = template.material;
    m.isPickable = false;
    // flat 2D sprites are unlit; a shadow sampler would clash with the atlas
    m.receiveShadows = false;
    m.setBoundingInfo(bounds);
    m.doNotSyncBoundingInfo = true;
    m.setEnabled(false);
    this.mesh = m;
  }

  get size() {
    return this.slots.length;
  }

  add(h: Handle, m: Matrix) {
    const slot = this.slots.length;
    if ((slot + 1) * 16 > this.buf.length) {
      const next = new Float32Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
      this.resized = true;
    }
    this.slots.push(h);
    this.slotOf.set(h, slot);
    m.copyToArray(this.buf, slot * 16);
    this.touch();
    this.mirror?.add(h, m);
  }

  set(h: Handle, m: Matrix) {
    const slot = this.slotOf.get(h);
    if (slot === undefined) return;
    m.copyToArray(this.buf, slot * 16);
    this.touch();
    this.mirror?.set(h, m);
  }

  remove(h: Handle) {
    const slot = this.slotOf.get(h);
    if (slot === undefined) return;
    const last = this.slots.length - 1;
    if (slot !== last) {
      // move the last instance into the hole
      this.buf.copyWithin(slot * 16, last * 16, last * 16 + 16);
      const moved = this.slots[last];
      this.slots[slot] = moved;
      this.slotOf.set(moved, slot);
    }
    this.slots.pop();
    this.slotOf.delete(h);
    this.touch();
    this.mirror?.remove(h);
  }

  setVisible(v: boolean) {
    if (v === this.visible) return;
    this.visible = v;
    this.touch();
  }

  private touch() {
    if (this.dirty) return;
    this.dirty = true;
    this.batches.markDirty(this);
  }

  /** Upload once per frame, however many tiles changed. Hidden batches skip the upload; setVisible(true) re-flushes. */
  flush() {
    this.dirty = false;
    const n = this.slots.length;
    const on = this.visible && n > 0;
    this.mesh.setEnabled(on);
    if (!on) return;
    if (this.resized || !this.mesh.hasThinInstances) this.mesh.thinInstanceSetBuffer('matrix', this.buf, 16, false);
    else this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.thinInstanceCount = n;
    this.resized = false;
  }
}

export class TileBatches {
  private cells = new Map<string, ThinBatch>();
  private farm = new Map<string, ThinBatch>();
  private dirty = new Set<ThinBatch>();
  private nextHandle = 1;
  private shadows: ShadowGenerator | null = null;
  private far = false;
  private static readonly WORLD = new BoundingInfo(new Vector3(-1e4, -1, -1e4), new Vector3(1e4, 3, 1e4));

  constructor(private scene: Scene) {
    scene.onBeforeRenderObservable.add(() => this.flush());
  }

  handle(): Handle {
    return this.nextHandle++;
  }

  /** Parcel cell that a world position belongs to (parcel centres sit on a PARCEL_PITCH grid). */
  static cell(x: number, z: number) {
    return `${Math.round(x / PARCEL_PITCH)},${Math.round(z / PARCEL_PITCH)}`;
  }

  /**
   * The batch for `key` in the parcel cell containing (x, z). `detailed` is the
   * close-up model; `simple` the overview one (may be the same mesh).
   */
  get(key: string, x: number, z: number, models: () => { detailed: Mesh; simple: Mesh }, castShadows: boolean): ThinBatch {
    const cell = TileBatches.cell(x, z);
    const id = `${cell}|${key}`;
    let b = this.cells.get(id);
    if (!b) {
      const { detailed, simple } = models();
      let farm = this.farm.get(key);
      if (!farm) {
        farm = new ThinBatch(this.scene, `farm|${key}`, simple, TileBatches.WORLD, this, null);
        farm.setVisible(this.far);
        this.farm.set(key, farm);
      }
      const [cx, cz] = cell.split(',').map(Number);
      const half = PARCEL_PITCH / 2;
      const bounds = new BoundingInfo(
        new Vector3(cx * PARCEL_PITCH - half, -1, cz * PARCEL_PITCH - half),
        new Vector3(cx * PARCEL_PITCH + half, 3, cz * PARCEL_PITCH + half),
      );
      b = new ThinBatch(this.scene, `tiles|${id}`, detailed, bounds, this, farm);
      b.setVisible(!this.far);
      if (castShadows) {
        b.mesh.metadata = { castShadows: true };
        this.shadows?.addShadowCaster(b.mesh, false);
      }
      this.cells.set(id, b);
    }
    return b;
  }

  markDirty(b: ThinBatch) {
    this.dirty.add(b);
  }

  private flush() {
    if (!this.dirty.size) return;
    for (const b of this.dirty) b.flush();
    this.dirty.clear();
  }

  /** Overview: draw the farm-wide simplified batches instead of the per-parcel ones. */
  setFar(far: boolean) {
    if (far === this.far) return;
    this.far = far;
    for (const b of this.cells.values()) b.setVisible(!far);
    for (const b of this.farm.values()) b.setVisible(far);
  }

  attachShadows(sg: ShadowGenerator) {
    this.shadows = sg;
    for (const b of this.cells.values()) if (b.mesh.metadata?.castShadows) sg.addShadowCaster(b.mesh, false);
  }

  stats() {
    let instances = 0;
    for (const b of this.cells.values()) instances += b.size;
    return { batches: this.cells.size + this.farm.size, instances };
  }
}

export type { ThinBatch };
