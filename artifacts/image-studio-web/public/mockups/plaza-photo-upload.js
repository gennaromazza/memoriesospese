// Shared by both Plaza revisions: local upload feedback and a visible rear-photo shortcut.
export function installPlazaPhotoUpload({ setPhoto, viewBack, fail, embedded, openBackPanel, canUpload }) {
  const get = id => document.getElementById(id);
  for (const [inputId, statusId, side] of [
    ['coverUpload', 'photoStatus', 'front'],
    ['backUpload', 'backPhotoStatus', 'back'],
  ]) {
    const input = get(inputId);
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file || !canUpload()) return;
      const status = get(statusId);
      try {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error('Formato non supportato. Scegli una foto JPEG, PNG o WebP.');
        }
        status.textContent = 'Caricamento della foto…';
        get('status').textContent = '';
        await setPhoto({ blob: file, name: file.name, source: 'local' }, side);
        if (side === 'back') viewBack();
      } catch (error) {
        const message = error.message || 'Foto non caricata. Scegli un’altra immagine e riprova.';
        status.textContent = message;
        fail(new Error(message));
      }
    };
  }
  // Embedded viewers use the parent's uploader, which persists the image.
  if (embedded) return;
  const button = document.createElement('button');
  button.id = 'backPhotoShortcut';
  button.type = 'button';
  button.textContent = 'Carica foto sul retro del plexiglass';
  button.style.cssText = 'width:100%;min-height:44px;margin-bottom:12px';
  button.onclick = () => {
    if (!canUpload()) return;
    openBackPanel();
    get('backUpload').click();
  };
  document.querySelector('.tools').prepend(button);
}
