export function yieldToBrowser() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function getExportSize(renderer) {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /swiftshader|software|llvmpipe|mesa/i.test(rendererName);
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