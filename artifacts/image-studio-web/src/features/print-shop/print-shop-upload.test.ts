import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PrintUploadCancelledError,
  uploadPrintFileResumable,
} from './print-shop-upload';

class FakeXmlHttpRequest {
  static instances: FakeXmlHttpRequest[] = [];
  readonly upload = {
    addEventListener: (name: string, listener: (event: any) => void) => {
      this.uploadListeners.set(name, listener);
    },
  };
  readonly headers = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly uploadListeners = new Map<string, (event: any) => void>();
  method = '';
  url = '';
  body?: File;
  status = 0;
  aborted = false;

  constructor() {
    FakeXmlHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener);
  }

  send(body: File) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.listeners.get('abort')?.();
  }

  emit(name: string) {
    this.listeners.get(name)?.();
  }
}

function options(signal?: AbortSignal) {
  return {
    file: new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'foto.jpg', { type: 'image/jpeg' }),
    uploadUrl: 'https://storage.googleapis.test/upload/session',
    storagePath: 'print-orders/user/order/asset/original.jpg',
    orderId: 'order',
    assetId: 'asset',
    ownerUid: 'user',
    sha256: 'hash',
    signal,
  };
}

describe('temporary print upload session', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeXmlHttpRequest.instances = [];
  });

  it('uploads the whole JPEG to the backend-issued resumable URL', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest as any);
    const onProgress = vi.fn();
    const promise = uploadPrintFileResumable({ ...options(), onProgress });
    const request = FakeXmlHttpRequest.instances[0];

    expect(request.method).toBe('PUT');
    expect(request.url).toBe(options().uploadUrl);
    expect(request.headers.get('Content-Type')).toBe('image/jpeg');
    expect(request.headers.get('Content-Range')).toBe('bytes 0-3/4');
    expect(request.body?.name).toBe('foto.jpg');

    request.uploadListeners.get('progress')?.({ lengthComputable: true, loaded: 4, total: 4 });
    request.status = 200;
    request.emit('load');

    await expect(promise).resolves.toBeUndefined();
    expect(onProgress).toHaveBeenNthCalledWith(1, 99);
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('cancels the network request when the photo is removed', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest as any);
    const controller = new AbortController();
    const promise = uploadPrintFileResumable(options(controller.signal));
    const rejection = expect(promise).rejects.toBeInstanceOf(PrintUploadCancelledError);

    controller.abort();

    await rejection;
    expect(FakeXmlHttpRequest.instances[0].aborted).toBe(true);
  });
});
