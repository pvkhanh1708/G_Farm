import { Material } from '@babylonjs/core/Materials/material.js';
import { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Scene } from '@babylonjs/core/scene.js';

/**
 * Vertex wind sway injected into PBR materials. Bend weight grows with the
 * vertex's local height, so meshes must be modelled with their base at y=0.
 */
export class WindPlugin extends MaterialPluginBase {
  static time = 0;
  strength: number;

  constructor(material: Material, strength: number) {
    super(material, 'Wind', 200, { WIND: false });
    this.strength = strength;
    this._enable(true);
  }

  prepareDefines(defines: MaterialDefines) {
    defines.WIND = true;
  }

  getClassName() {
    return 'WindPlugin';
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'windTime', size: 1, type: 'float' },
        { name: 'windStrength', size: 1, type: 'float' },
      ],
      vertex: `#ifdef WIND
        uniform float windTime;
        uniform float windStrength;
      #endif`,
    };
  }

  bindForSubMesh(uniformBuffer: UniformBuffer) {
    uniformBuffer.updateFloat('windTime', WindPlugin.time);
    uniformBuffer.updateFloat('windStrength', this.strength);
  }

  getCustomCode(shaderType: string) {
    if (shaderType !== 'vertex') return null;
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
      #ifdef WIND
        float wH = max(position.y, 0.0);
        float wPhase = worldPos.x * 0.37 + worldPos.z * 0.29;
        float wGust = 0.65 + 0.35 * sin(windTime * 0.45 + worldPos.x * 0.06 + worldPos.z * 0.04);
        float wS = (sin(windTime * 1.6 + wPhase) * 0.7 + sin(windTime * 2.9 + wPhase * 1.9) * 0.3) * wGust;
        float wB = wH * wH * windStrength;
        worldPos.x += wS * wB;
        worldPos.z += (wS * 0.55 + 0.25 * wGust) * wB;
        worldPos.y -= abs(wS) * wB * 0.15;
      #endif`,
    };
  }
}

export interface ToonMatOptions {
  color?: Color3;
  texture?: BaseTexture | null;
  roughness?: number;
  wind?: number;
  doubleSided?: boolean;
  emissive?: Color3;
  alpha?: number;
}

/**
 * Stylized PBR: non-metallic, high roughness, colour carried mostly by vertex
 * colours so many props can share one material (fewer draw calls).
 */
export function toonMaterial(scene: Scene, name: string, opts: ToonMatOptions = {}): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.metallic = 0;
  m.roughness = opts.roughness ?? 0.82;
  m.albedoColor = opts.color ?? Color3.White();
  if (opts.texture) m.albedoTexture = opts.texture;
  if (opts.emissive) m.emissiveColor = opts.emissive;
  m.environmentIntensity = 0;
  m.directIntensity = 1;
  m.specularIntensity = 0.12;
  if (opts.doubleSided) {
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
  }
  if (opts.alpha !== undefined && opts.alpha < 1) {
    m.alpha = opts.alpha;
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  if (opts.wind) new WindPlugin(m, opts.wind);
  return m;
}

/** Shared materials, created once per scene. */
export interface MaterialLibrary {
  props: PBRMaterial; // vertex-coloured static props (cliffs, rocks, trunks...)
  soil: PBRMaterial;
  grassGround: PBRMaterial;
  foliage: PBRMaterial; // tree canopies (gentle wind)
  grass: PBRMaterial; // grass blades / flowers (strong wind)
  cover: PBRMaterial; // locked grass tiles
}
