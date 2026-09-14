const fabricSamplingShader = `
vec4 sampleFabric(sampler2D fabric, vec2 uv) {
  // La continuità viene dalla texture mirrored-repeat. Non spostiamo più
  // casualmente ogni cella: gli spostamenti generavano bande e puntini.
  return textureGrad(fabric, uv, dFdx(uv), dFdy(uv));
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