// Adattatore di sola presentazione per i renderer same-origin esistenti.
// I controlli restano nel loro documento, con gli handler e gli ID originali.
export function installMockupWizard(doc: Document, mobile = false) {
  const content = doc.querySelector<HTMLElement>('.panel-content');
  const stage = doc.querySelector<HTMLElement>('.stage');
  if (!content || !stage) throw new Error('Interfaccia del modello non disponibile');
  const slot = doc.createElement('div'); slot.id = 'wizard-slot'; content.prepend(slot);
  const actionsSlot = doc.createElement('div'); actionsSlot.id = 'wizard-actions-slot';
  const controlsSlot = doc.createElement('div'); controlsSlot.id = 'wizard-controls-slot';
  if (mobile) {
    content.parentElement?.append(actionsSlot); stage.append(controlsSlot);
    const download = doc.querySelector('.download-bar'); if (download) content.append(download);
    // Il selettore nativo del file è nascosto anche quando i selettori CSS
    // dello step rendono visibili i figli di Dettagli (Custodia usa CSS, non hidden).
    for (const id of ['coverUpload', 'backUpload', 'restorePhoto', 'photoStatus']) {
      const element = doc.getElementById(id); if (element) element.hidden = true;
      const label = doc.querySelector<HTMLElement>(`label[for="${id}"]`); if (label) label.hidden = true;
    }
  }
  doc.body.dataset.wizard = 'true';
  if (mobile) doc.body.dataset.wizardMobile = 'true';
  const style = doc.createElement('style');
  style.textContent = `
    body[data-wizard] {height:100dvh;overflow:hidden;font-size:16px}
    body[data-wizard] header,body[data-wizard] aside>h1,body[data-wizard] aside>p,body[data-wizard] aside>nav,
    body[data-wizard] .tools,body[data-wizard] .view-tools,body[data-wizard] .hint,body[data-wizard] .zoom {display:none!important}
    body[data-wizard] main {display:grid!important;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(120px,40%) minmax(0,1fr);height:100%;min-height:0}
    body[data-wizard] .workspace {grid-row:1;display:block;min-height:0}
    body[data-wizard] .stage {height:100%;min-height:0;position:relative}
    body[data-wizard] aside {grid-row:2;padding:14px;min-height:0;overflow:hidden;border:0}
    body[data-wizard] .panel-content {max-height:none;min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 4px 12px 0}
    body[data-wizard] button,body[data-wizard] select,body[data-wizard] input:not([type=range]) {min-height:44px;font-size:16px}
    body[data-wizard] input:not([type=range]):not([type=checkbox]) {width:100%}
    body[data-wizard] .materials {grid-template-columns:repeat(3,minmax(0,1fr));max-height:none}
    body[data-wizard] .materials button {font-size:13px;overflow-wrap:anywhere}
    body[data-wizard] :is(.category,.material-category)>summary {cursor:default;list-style:none}
    body[data-wizard] :is(.category,.material-category)>summary::-webkit-details-marker {display:none}
    body[data-wizard] .badge {top:8px;left:10px;right:10px;font-size:11px}
    body[data-wizard] .wizard-views {position:absolute;bottom:8px;left:8px;right:8px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
    body[data-wizard] .wizard-views button {font-size:13px;padding:7px 10px;background:#faf8f3}
    body[data-wizard][data-home-scene]:not([data-home-scene="none"]) .wizard-views {display:none}
    body[data-wizard] .wizard-cards {display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
    body[data-wizard] .wizard-cards button {flex:1 1 120px;text-align:left}
    body[data-wizard] details>summary {min-height:44px;padding:12px 0;cursor:pointer}
    body[data-wizard] .download-bar {display:none}
    body[data-wizard][data-wizard-step="4"] .download-bar {display:block}
    body[data-wizard] .panel-content>section {display:none!important}
    body[data-wizard][data-wizard-step="2"] #fabricPanel,
    body[data-wizard][data-wizard-step="2"] #detailPanel,
    body[data-wizard][data-wizard-step="3"] #detailPanel,
    body[data-wizard][data-wizard-step="4"] #summaryPanel {display:block!important}
    body[data-wizard][data-wizard-step="2"] #detailPanel>*:not([data-wizard-material]),
    body[data-wizard][data-wizard-step="3"] #detailPanel>[data-wizard-material] {display:none!important}
    body[data-wizard][data-wizard-step="3"] #detailPanel>h2:first-child {display:none}
    body[data-wizard] #wizard-home {display:none}
    body[data-wizard][data-wizard-step="4"] #wizard-home {display:block}
    body[data-wizard] #wizard-home section {display:block}
    body[data-wizard] #wizard-slot h3 {font:500 20px Georgia,serif;margin:0 0 12px}
    body[data-wizard] #wizard-slot .wizard-model {display:block;width:100%;margin:8px 0;text-align:left}
    body[data-wizard] #wizard-slot .wizard-model small {display:block;margin-top:4px}
    body[data-wizard] #wizard-slot .wizard-photo-actions {display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    body[data-wizard] #wizard-slot .wizard-photo-actions button {flex:1}
    body[data-wizard] #wizard-slot p {margin:8px 0 12px}
    @media(min-width:768px){body[data-wizard] main{grid-template-columns:minmax(0,1.4fr) minmax(300px,1fr);grid-template-rows:minmax(0,1fr)}body[data-wizard] aside{grid-row:1;grid-column:2;padding:22px}body[data-wizard] .workspace{grid-column:1}}
    @media(max-width:767px) and (max-height:380px){body[data-wizard] main{grid-template-rows:minmax(100px,35%) minmax(0,1fr)}body[data-wizard] .wizard-views button:nth-child(3){display:none}}
  `;
  doc.head.append(style);
  if (mobile) {
    const mobileStyle = doc.createElement('style');
    mobileStyle.textContent = `
      body[data-wizard-mobile] main {grid-template-columns:minmax(0,1fr) clamp(218px,32%,310px)!important;grid-template-rows:minmax(0,1fr)!important}
      body[data-wizard-mobile] .workspace {grid-column:1;grid-row:1;display:block!important;overflow:hidden}
      body[data-wizard-mobile] .stage {position:relative!important;min-height:0!important;height:100%!important}
      body[data-wizard-mobile] aside {grid-column:2;grid-row:1;display:flex;flex-direction:column;padding:8px 10px 0!important;border-left:1px solid #d8ded7;overflow:hidden!important}
      body[data-wizard-mobile] .panel-content {flex:1;min-height:0!important;max-height:none!important;scrollbar-gutter:auto;padding:0 3px 10px 0}
      body[data-wizard-mobile] .badge {display:none}
      body[data-wizard-mobile] button {font-size:13px}
      body[data-wizard-mobile] .wizard-cards {gap:6px;margin:6px 0}
      body[data-wizard-mobile] .wizard-cards button {flex:1 1 100%;padding:9px;font-size:13px}
      body[data-wizard-mobile] .download-bar {display:none!important}
      body[data-wizard-mobile][data-wizard-step="6"] .download-bar {display:block!important}
      body[data-wizard-mobile] #wizard-slot h3 {font-size:17px;margin-bottom:6px}
      body[data-wizard-mobile] #wizard-slot p {font-size:13px;margin:6px 0}
      body[data-wizard-mobile] .materials {grid-template-columns:repeat(2,minmax(0,1fr))}
      body[data-wizard-mobile] #fabricPanel>h2 {display:none}
      body[data-wizard-mobile] .category summary,body[data-wizard-mobile] .material-category summary {cursor:pointer;list-style:disclosure-closed;padding:10px}
      body[data-wizard-mobile] details[open]>summary {list-style:disclosure-open}
      body[data-wizard][data-wizard-mobile][data-wizard-step] :is(#fabricPanel,#detailPanel,#summaryPanel) {display:none!important}
      body[data-wizard][data-wizard-mobile][data-wizard-step="2"] #fabricPanel,
      body[data-wizard][data-wizard-mobile][data-wizard-step="3"] #detailPanel,
      body[data-wizard][data-wizard-mobile][data-wizard-step="4"] #detailPanel,
      body[data-wizard][data-wizard-mobile][data-wizard-step="5"] #detailPanel,
      body[data-wizard][data-wizard-mobile][data-wizard-step="6"] #summaryPanel {display:block!important}
      body[data-wizard][data-wizard-mobile][data-wizard-step] #detailPanel>* {display:none!important}
      body[data-wizard][data-wizard-mobile][data-wizard-step="3"] #detailPanel>[data-wizard-frame]:not([hidden]),
      body[data-wizard][data-wizard-mobile][data-wizard-step="4"] #detailPanel>*:not([data-wizard-frame]):not([data-wizard-rear]):not([hidden]):not(h2),
      body[data-wizard][data-wizard-mobile][data-wizard-step="5"] #detailPanel>[data-wizard-rear]:not([hidden]) {display:block!important}
      body[data-wizard][data-wizard-mobile] #wizard-home {display:none}
      body[data-wizard][data-wizard-mobile][data-wizard-home="true"] #wizard-home {display:block}
      body[data-wizard-mobile][data-wizard-home="true"] #wizard-home>summary {display:none}
      body[data-wizard-mobile][data-wizard-home="true"] #wizard-slot,
      body[data-wizard-mobile][data-wizard-home="true"] .download-bar,
      body[data-wizard-mobile][data-wizard-home="true"] #wizard-controls-slot {display:none!important}
      body[data-wizard][data-wizard-mobile][data-wizard-home="true"][data-wizard-step] :is(#fabricPanel,#detailPanel,#summaryPanel) {display:none!important}
      body[data-wizard-mobile] #summaryPanel>h2, body[data-wizard-mobile] #photoStatus {display:none}
      body[data-wizard-mobile] #engravingPreview {max-height:110px;object-fit:contain}
      body[data-wizard-mobile] #wizard-actions-slot {flex-shrink:0;border-top:1px solid #d8ded7;background:#faf8f3;margin:0 -10px;padding:7px 10px}
      body[data-wizard-mobile] .wizard-step-heading {display:flex;align-items:center;gap:8px;position:sticky;top:0;z-index:1;background:#faf8f3;padding:5px 0 9px;font-size:13px}
      body[data-wizard-mobile] .wizard-step-heading span {font-size:11px;color:#657770}
      body[data-wizard-mobile] .wizard-nav {display:flex;gap:6px;justify-content:space-between}
      body[data-wizard-mobile] .wizard-nav button,body[data-wizard-mobile] .wizard-mobile-actions>button {display:flex;align-items:center;justify-content:center;gap:4px;min-height:44px;padding:7px 9px;border-radius:6px;font-size:12px;white-space:normal}
      body[data-wizard-mobile] .wizard-nav button:first-child {flex:0 0 auto}
      body[data-wizard-mobile] .wizard-nav button:last-child {flex:1}
      body[data-wizard-mobile] .wizard-nav .wizard-primary {background:#527684;color:white;border-color:#527684}
      body[data-wizard-mobile] .wizard-save {width:100%;min-height:44px!important;border:0;padding:4px!important;background:transparent;color:#46666a}
      body[data-wizard-mobile] .wizard-message {font-size:11px;margin:0 0 5px!important;max-height:40px;overflow:auto;overflow-wrap:anywhere}
      body[data-wizard-mobile] .wizard-unsaved {font-size:11px;display:block;margin-bottom:4px;color:#765f32}
      body[data-wizard-mobile] #wizard-controls-slot {position:absolute;inset:0;pointer-events:none}
      body[data-wizard-mobile] .wizard-iconbar {position:absolute;bottom:5px;left:7px;display:flex;gap:2px;pointer-events:auto}
      body[data-wizard-mobile] .wizard-iconbar button, body[data-wizard-mobile] .wizard-help {position:relative;width:44px;height:44px;min-height:44px;padding:0!important;border:0!important;background:transparent;display:flex;align-items:center;justify-content:center;color:#29413f;isolation:isolate}
      body[data-wizard-mobile] .wizard-iconbar button:before,body[data-wizard-mobile] .wizard-help:before {content:'';position:absolute;inset:5px;border:1px solid #c9d2cb;border-radius:5px;background:#faf8f3;z-index:-1}
      body[data-wizard-mobile] .wizard-iconbar button span {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
      body[data-wizard-mobile] .wizard-help {position:absolute;right:5px;top:5px;pointer-events:auto}
      body[data-wizard-mobile] .wizard-view-message {position:absolute;top:9px;left:10px;padding:4px 7px;font-size:11px;background:#faf8f3e8;border-radius:4px}
      body[data-wizard-mobile] .wizard-gesture-guide {pointer-events:auto;position:absolute;top:12px;left:12px;right:52px;max-width:300px;max-height:calc(100% - 65px);overflow:auto;background:#faf8f3;border:1px solid #c9d2cb;border-radius:10px;box-shadow:0 5px 25px #263c3325;padding:12px;color:#29413f;font-size:13px}
      body[data-wizard-mobile] .wizard-gesture-guide p {font-size:12px;line-height:1.6;margin:7px 0}
      body[data-wizard-mobile] .wizard-gesture-guide button {min-height:44px;float:right;background:#527684;color:white;font-size:12px;padding:7px 14px}
      body[data-wizard-mobile] .wizard-gesture-guide:after {content:'';display:block;clear:both}
      body[data-wizard-mobile] .download-bar {padding:4px 0;margin:0}
      body[data-wizard-mobile] .download-bar #downloadClient {background:transparent;color:#46666a;font-size:12px;text-align:left}
      @media(max-height:270px){body[data-wizard-mobile] .wizard-nav button span{display:none}body[data-wizard-mobile] .wizard-gesture-guide{font-size:12px}}
    `;
    doc.head.append(mobileStyle);
  }
  const detail = doc.getElementById('detailPanel');
  const mirrors: { select: HTMLSelectElement; buttons: HTMLButtonElement[] }[] = [];
  for (const id of ['frameFinish', 'coverLayout', 'coverOptions', ...(mobile ? ['backCover'] : [])]) {
    const element = doc.getElementById(id);
    if (!element || !detail?.contains(element)) continue;
    const group = id === 'backCover' ? 'wizardRear' : 'wizardMaterial';
    element.dataset[group] = 'true';
    if (id === 'frameFinish') element.dataset.wizardFrame = 'true';
    const label = doc.querySelector<HTMLElement>(`label[for="${id}"]`);
    if (label) label.dataset[group] = 'true';
    if (label && id === 'frameFinish') label.dataset.wizardFrame = 'true';
    if (element.tagName !== 'SELECT') continue;
    const select = element as HTMLSelectElement;
    const cards = doc.createElement('div'); cards.className = 'wizard-cards'; cards.dataset[group] = 'true';
    if (id === 'frameFinish') cards.dataset.wizardFrame = 'true';
    cards.setAttribute('role', 'group'); cards.setAttribute('aria-label', label?.textContent || id);
    const buttons = Array.from(select.options).map(option => {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = option.text;
      button.onclick = () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); refresh(); };
      cards.append(button); return button;
    });
    select.hidden = true; select.after(cards); mirrors.push({ select, buttons });
  }
  // Il ritaglio fine resta disponibile, ma non occupa il percorso principale.
  for (const [ids, title] of [[['photoZoom', 'photoX', 'photoY'], 'Sistema la foto di copertina'], [['backZoom', 'backX', 'backY'], 'Sistema la foto del retro']] as const) {
    const first = doc.getElementById(ids[0]); if (!first) continue;
    const adjust = doc.createElement('details'); const summary = doc.createElement('summary'); summary.textContent = title; adjust.append(summary);
    const firstLabel = doc.querySelector(`label[for="${ids[0]}"]`); (firstLabel || first).before(adjust);
    for (const id of ids) { const label = doc.querySelector(`label[for="${id}"]`); const input = doc.getElementById(id); if (label) adjust.append(label); if (input) adjust.append(input); }
  }
  doc.querySelectorAll<HTMLDetailsElement>('.category,.material-category').forEach(group => { group.open = !mobile; if (!mobile) group.querySelector('summary')?.addEventListener('click', event => event.preventDefault()); });
  if (mobile) {
    const back = doc.getElementById('backPhotoControls'); if (back) back.dataset.wizardRear = 'true';
  }
  const home = doc.getElementById('homePanel');
  if (home) { const wrap = doc.createElement('details'); wrap.id = 'wizard-home'; const title = doc.createElement('summary'); title.textContent = 'Vedi in casa · facoltativo'; wrap.append(title); content.append(wrap); wrap.append(home); home.hidden = false; }
  const views = doc.createElement('div'); views.className = 'wizard-views';
  for (const [id, label] of [['front', 'Fronte'], ['back', 'Retro'], ['reset', 'Reimposta vista'], ...(mobile ? [['plus', 'Zoom +'], ['minus', 'Zoom −']] : [])]) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = () => { doc.getElementById(id)?.click(); refresh(); }; views.append(button);
  }
  const extraction = doc.getElementById('extract') as HTMLInputElement | null;
  if (extraction) { const button = doc.createElement('button'); button.type = 'button'; button.dataset.extractPreset = 'true'; button.textContent = 'Estrai album'; button.onclick = () => { extraction.value = Number(extraction.value) ? '0' : '100'; extraction.dispatchEvent(new Event('input', { bubbles: true })); refresh(); }; views.append(button); }
  if (!mobile) stage.append(views);
  function refresh() {
    mirrors.forEach(({ select, buttons }) => buttons.forEach((button, index) => { button.disabled = select.disabled; button.setAttribute('aria-pressed', String(select.selectedIndex === index)); }));
    const extractButton = views.querySelector<HTMLButtonElement>('[data-extract-preset]');
    if (extractButton && extraction) extractButton.textContent = Number(extraction.value) ? 'Reinserisci album' : 'Estrai album';
  }
  const observer = new MutationObserver(refresh);
  mirrors.forEach(({ select }) => observer.observe(select, { attributes: true, attributeFilter: ['disabled'] }));
  let previousHome = 'sideboard';
  return { slot, actionsSlot, controlsSlot, refresh, dispose() { observer.disconnect(); },
    view(action: 'front' | 'back' | 'reset' | 'plus' | 'minus' | 'extract' | 'rotate') {
      if (action === 'extract' && extraction) { extraction.value = Number(extraction.value) ? '0' : '100'; extraction.dispatchEvent(new Event('input', { bubbles: true })); }
      else doc.getElementById(action)?.click();
      refresh();
    },
    home(open: boolean) {
      if (!mobile) return;
      doc.body.dataset.wizardHome = String(open);
      const wrapper = doc.querySelector<HTMLDetailsElement>('#wizard-home'); if (wrapper) wrapper.open = open;
      const select = doc.querySelector<HTMLSelectElement>('#homeScene');
      if (select && open && select.value === 'none') { select.value = previousHome; select.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (select && !open && select.value !== 'none') { previousHome = select.value; select.value = 'none'; select.dispatchEvent(new Event('change', { bubbles: true })); }
      content.scrollTop = 0;
    }, step(value: number) {
    doc.body.dataset.wizardStep = String(value);
    if (!mobile && value === 4) doc.getElementById('summaryPanel')?.after(slot); else content.prepend(slot);
    if (mobile && (value === 4 || value === 5)) doc.getElementById(value === 5 ? 'back' : 'front')?.click();
    content.scrollTop = 0; refresh();
  } };
}
