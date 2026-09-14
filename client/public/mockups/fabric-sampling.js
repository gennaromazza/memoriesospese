const fabricSamplingShader = `
vec2 fabricOffset(vec2 cell) {
  return fract(sin(vec2(
    dot(cell, vec2(127.1, 311.7)),
    dot(cell, vec2(269.5, 183.3))
  )) * 43758.5453);
}

vec4 sampleFabric(sampler2D fabric, vec2 uv) {
  vec2 cell = floor(uv);
  vec2 f = smoothstep(0.0, 1.0, fract(uv));
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  vec4 weights = vec4(
    (1.0 - f.x) * (1.0 - f.y),
    f.x * (1.0 - f.y),
    (1.0 - f.x) * f.y,
    f.x * f.y
  );
  weights /= dot(weights, vec4(1.0));

  // Cambiamo fase solo al colore: il rilievo resta continuo e non crea
  // punti luminosi o cavità artificiali sui confini delle celle.
  return weights.x * textureGrad(fabric, uv + fabricOffset(cell), dx, dy)
       + weights.y * textureGrad(fabric, uv + fabricOffset(cell + vec2(1.0, 0.0)), dx, dy)
       + weights.z * textureGrad(fabric, uv + fabricOffset(cell + vec2(0.0, 1.0)), dx, dy)
       + weights.w * textureGrad(fabric, uv + fabricOffset(cell + vec2(1.0, 1.0)), dx, dy);
}
`;

export function installFabricSampling(material, THREE) {
  material.onBeforeCompile = shader => {
    const mapFragment = THREE.ShaderChunk.map_fragment
      .replace('texture2D( map, vMapUv )', 'sampleFabric(map, vMapUv)');
    const normalFragment = THREE.ShaderChunk.normal_fragment_maps.replace(
      'dHdxy_fwd(), faceDirection',
      `dHdxy_fwd() * (1.0 - smoothstep(0.75, 2.5,
        max(length(dFdx(vBumpMapUv) * vec2(textureSize(bumpMap, 0))),
            length(dFdy(vBumpMapUv) * vec2(textureSize(bumpMap, 0)))))),
       faceDirection`
    );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fabricSamplingShader}`)
      .replace('#include <map_fragment>', mapFragment)
      .replace('#include <normal_fragment_maps>', normalFragment);
  };
  material.customProgramCacheKey = () => 'fabric-stochastic-color-v5';
  material.needsUpdate = true;
}