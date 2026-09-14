const fabricSamplingShader = `
vec4 sampleFabric(sampler2D fabric, vec2 uv) {
  // La continuità viene dalla texture mirrored-repeat. Non spostiamo più
  // casualmente ogni cella: gli spostamenti generavano bande e puntini.
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  vec2 textureSizeUv = vec2(textureSize(fabric, 0));
  float footprint = max(length(dx * textureSizeUv), length(dy * textureSizeUv));
  // Quando la trama occupa meno di un pixel, un mipmap leggermente più
  // sfocato evita il moiré senza togliere il dettaglio ravvicinato.
  float mipSmoothing = 1.0 + 1.2 * smoothstep(0.75, 3.0, footprint);
  return textureGrad(fabric, uv, dx * mipSmoothing, dy * mipSmoothing);
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