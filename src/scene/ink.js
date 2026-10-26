import * as THREE from 'three';

// Ink outlines, drawn the way an illustrator would: around every silhouette,
// at every step in depth, and along sharp creases between faces.
//
// 1. Render view-space normals (rgb) + coverage (alpha) and depth into a target,
//    using only layer 0 (effects on layer 1 are never outlined).
// 2. Render the scene normally to the screen.
// 3. Blend a full-screen quad on top that draws ink where neighbouring pixels
//    disagree in coverage, depth curvature or normal direction.

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float thickness;
  uniform float depthRange;
  uniform float depthEdge;
  uniform float creaseEdge;
  uniform vec3 ink;
  uniform float strength;
  varying vec2 vUv;

  float depthAt(vec2 uv) { return texture2D(tDepth, uv).r * depthRange; }

  // How strongly the pixel at uv differs from the pair of neighbours at ±off
  float edgeAcross(vec2 uv, vec2 off, vec4 n0, float d0) {
    vec4 nA = texture2D(tNormal, uv + off);
    vec4 nB = texture2D(tNormal, uv - off);
    // Outer silhouette: something on one side, nothing on the other
    float e = max(abs(nA.a - n0.a), abs(nB.a - n0.a));
    if (n0.a < 0.5) return e;
    // Depth: the second difference stays ~0 across a tilted plane but jumps at a step
    float dA = nA.a > 0.5 ? depthAt(uv + off) : d0;
    float dB = nB.a > 0.5 ? depthAt(uv - off) : d0;
    float curve = abs(dA + dB - 2.0 * d0);
    e = max(e, smoothstep(depthEdge, depthEdge * 2.5, curve));
    // Creases: normals meeting at an angle
    vec3 c = n0.xyz * 2.0 - 1.0;
    float kA = nA.a > 0.5 ? 1.0 - dot(c, nA.xyz * 2.0 - 1.0) : 0.0;
    float kB = nB.a > 0.5 ? 1.0 - dot(c, nB.xyz * 2.0 - 1.0) : 0.0;
    e = max(e, 0.85 * smoothstep(creaseEdge, creaseEdge * 2.2, max(kA, kB)));
    return e;
  }

  void main() {
    vec4 n0 = texture2D(tNormal, vUv);
    float d0 = depthAt(vUv);
    vec2 o = texel * thickness;
    float e = edgeAcross(vUv, vec2(o.x, 0.0), n0, d0);
    e = max(e, edgeAcross(vUv, vec2(0.0, o.y), n0, d0));
    e = max(e, edgeAcross(vUv, o * 0.7071, n0, d0));
    e = max(e, edgeAcross(vUv, vec2(o.x, -o.y) * 0.7071, n0, d0));
    // Faint outer ring softens the line edge (cheap anti-aliasing)
    vec2 o2 = o * 1.6;
    float soft = max(edgeAcross(vUv, vec2(o2.x, 0.0), n0, d0), edgeAcross(vUv, vec2(0.0, o2.y), n0, d0));
    e = max(e, soft * 0.3);
    gl_FragColor = vec4(ink, clamp(e, 0.0, 1.0) * strength);
  }
`;

export function createInkPass(renderer) {
  const depthTexture = new THREE.DepthTexture(1, 1);
  depthTexture.type = THREE.UnsignedIntType;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  const normalMat = new THREE.MeshNormalMaterial();
  const quadMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tNormal: { value: target.texture },
      tDepth: { value: depthTexture },
      texel: { value: new THREE.Vector2(1, 1) },
      thickness: { value: 1 },
      depthRange: { value: 1 },
      depthEdge: { value: 0.12 },
      creaseEdge: { value: 0.28 },
      // Final screen colour, written as-is (no colour-space conversion in this shader)
      ink: { value: new THREE.Color(0x3c4150) },
      strength: { value: 0.92 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  quadMat.uniforms.ink.value.setRGB(0x3c / 255, 0x41 / 255, 0x50 / 255);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clear = new THREE.Color();
  renderer.shadowMap.autoUpdate = false;

  return {
    setSize(w, h) {
      target.setSize(w, h);
      quadMat.uniforms.texel.value.set(1 / w, 1 / h);
      quadMat.uniforms.thickness.value = Math.max(1, renderer.getPixelRatio() * 0.85);
    },
    render(scene, camera) {
      quadMat.uniforms.depthRange.value = camera.far - camera.near;
      // Depth curvature threshold scales with zoom so lines stay steady
      quadMat.uniforms.depthEdge.value = 0.1 / Math.max(0.5, camera.zoom ?? 1);

      // 1. normals + depth, layer 0 only
      const layers = camera.layers.mask;
      camera.layers.set(0);
      const prevOverride = scene.overrideMaterial;
      renderer.getClearColor(clear);
      const prevAlpha = renderer.getClearAlpha();
      scene.overrideMaterial = normalMat;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = prevOverride;
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, prevAlpha);
      camera.layers.mask = layers;

      // 2. the real picture (shadows refreshed once per frame)
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);

      // 3. ink on top
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(quadScene, quadCam);
      renderer.autoClear = auto;
    },
  };
}
