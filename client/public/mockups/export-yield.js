export function yieldToBrowser() {
  return new Promise(resolve => {
    let settled = false;
    const fallback = setTimeout(finish, 50);
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    else finish();
  });
}

export function isSoftwareRenderer(rendererName) {
  return /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(rendererName));
}

export function getWebGLInfo(renderer) {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const vendorName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : '';
  return {
    renderer: rendererName,
    vendor: vendorName,
    software: isSoftwareRenderer(rendererName),
  };
}

export function getExportSize(renderer) {
  const { software } = getWebGLInfo(renderer);
  const lowPower = software
    || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4)
    || (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
  return lowPower ? { width: 800, height: 600 } : { width: 1600, height: 1200 };
}

export function triggerDownload(url, filename) {
  const downloadDocument = window.parent !== window ? window.parent.document : document;
  const link = downloadDocument.createElement('a');
  link.href = url;
  link.download = filename;
  downloadDocument.body.append(link);
  link.click();
  link.remove();
}
