const fabricSamplingShader = `
vec4 sampleFabric(sampler2D fabric, vec2 uv) {
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  vec2 textureSizeUv = vec2(textureSize(fabric, 0));
  float footprint = max(length(dx * textureSizeUv), length(dy * textureSizeUv));

  float mipSmoothing = 1.0 + 1.2 * smoothstep(0.75, 3.0, footprint);
  return textureGrad(fabric, uv, dx * mipSmoothing, dy * mipSmoothing);
}
`;

export function installFabricSampling(material, THREE) {
  material.onBeforeCompile = (shader) => {
    // 1. Sostituzione sicura della Map (compatibile con texture2D e texture)
    const mapFragment = THREE.ShaderChunk.map_fragment.replace(
      /texture(2D)?\(\s*map\s*,\s*(vMapUv|vUv)\s*\)/g,
      "sampleFabric(map, $2)",
    );

    let normalFragment = THREE.ShaderChunk.normal_fragment_maps;

    // 2. Correzione per Normal Map vs Bump Map
    if (material.bumpMap) {
      // Le Bump Map usano la funzione dHdxy_fwd()
      const bumpUv = "vBumpMapUv";
      normalFragment = normalFragment.replace(
        "dHdxy_fwd(), faceDirection",
        `dHdxy_fwd() * (1.0 - smoothstep(0.75, 2.5,
          max(length(dFdx(${bumpUv}) * vec2(textureSize(bumpMap, 0))),
              length(dFdy(${bumpUv}) * vec2(textureSize(bumpMap, 0)))))),
         faceDirection`,
      );
    } else if (material.normalMap) {
      // Le Normal Map campionano direttamente la texture
      const normalUv = "vNormalMapUv";
      normalFragment = normalFragment.replace(
        /texture(2D)?\(\s*normalMap\s*,\s*(vNormalMapUv|vUv)\s*\)/g,
        `sampleFabric(normalMap, $2)`,
      );
    }

    // 3. Iniezione nello shader
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${fabricSamplingShader}`,
      )
      .replace("#include <map_fragment>", mapFragment)
      .replace("#include <normal_fragment_maps>", normalFragment);
  };

  material.customProgramCacheKey = () => "fabric-mirrored-mip-v8";
  material.needsUpdate = true;
}
