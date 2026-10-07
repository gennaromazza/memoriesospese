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
  const gl = renderer?.getContext?.();
  if (!gl) {
    return {
      available: false,
      renderer: '',
      vendor: '',
      software: false,
      hardware: false,
    };
  }
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const vendorName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : '';
  const software = isSoftwareRenderer(rendererName);
  return {
    available: true,
    renderer: rendererName,
    vendor: vendorName,
    software,
    hardware: Boolean(rendererName) && !software,
  };
}

export function getExportSize(renderer) {
  const { software, hardware } = getWebGLInfo(renderer);
  const lowPower = !hardware
    || software
    || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4)
    || (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
  return lowPower ? { width: 800, height: 600 } : { width: 1600, height: 1200 };
}

export function setExportProgress(statusElement, current, total) {
  if (statusElement) statusElement.textContent = `Preparazione vista ${current} di ${total}…`;
}

export function triggerDownload(url, filename) {
  const downloadDocument = window.parent !== window ? window.parent.document : document;
  const link = downloadDocument.createElement('a');
  link.href = url;
  link.download = filename;
  downloadDocument.body.append(link);
  link.click();
  // Under a busy WebGL export Chromium can observe the click after this
  // function returns; keep the parent anchor alive until the download starts.
  setTimeout(() => link.remove(), 1000);
}
