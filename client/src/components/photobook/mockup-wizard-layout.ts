// Adattatore di sola presentazione per i renderer same-origin esistenti.
// I controlli restano nel loro documento, con gli handler e gli ID originali.
export function installMockupWizard(doc: Document) {
  const content = doc.querySelector<HTMLElement>('.panel-content');
  const stage = doc.querySelector<HTMLElement>('.stage');
  if (!content || !stage) throw new Error('Interfaccia del modello non disponibile');
  const slot = doc.createElement('div'); slot.id = 'wizard-slot'; content.prepend(slot);
  doc.body.dataset.wizard = 'true';
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
  const detail = doc.getElementById('detailPanel');
  const mirrors: { select: HTMLSelectElement; buttons: HTMLButtonElement[] }[] = [];
  for (const id of ['frameFinish', 'coverLayout', 'coverOptions']) {
    const element = doc.getElementById(id);
    if (!element || !detail?.contains(element)) continue;
    element.dataset.wizardMaterial = 'true';
    const label = doc.querySelector<HTMLElement>(`label[for="${id}"]`);
    if (label) label.dataset.wizardMaterial = 'true';
    if (element.tagName !== 'SELECT') continue;
    const select = element as HTMLSelectElement;
    const cards = doc.createElement('div'); cards.className = 'wizard-cards'; cards.dataset.wizardMaterial = 'true';
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
  doc.querySelectorAll<HTMLDetailsElement>('.category,.material-category').forEach(group => { group.open = true; group.querySelector('summary')?.addEventListener('click', event => event.preventDefault()); });
  const home = doc.getElementById('homePanel');
  if (home) { const wrap = doc.createElement('details'); wrap.id = 'wizard-home'; const title = doc.createElement('summary'); title.textContent = 'Vedi in casa · facoltativo'; wrap.append(title); content.append(wrap); wrap.append(home); home.hidden = false; }
  const views = doc.createElement('div'); views.className = 'wizard-views';
  for (const [id, label] of [['front', 'Fronte'], ['back', 'Retro'], ['reset', 'Reimposta vista']]) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = () => { doc.getElementById(id)?.click(); refresh(); }; views.append(button);
  }
  const extraction = doc.getElementById('extract') as HTMLInputElement | null;
  if (extraction) { const button = doc.createElement('button'); button.type = 'button'; button.dataset.extractPreset = 'true'; button.textContent = 'Estrai album'; button.onclick = () => { extraction.value = Number(extraction.value) ? '0' : '100'; extraction.dispatchEvent(new Event('input', { bubbles: true })); refresh(); }; views.append(button); }
  stage.append(views);
  function refresh() {
    mirrors.forEach(({ select, buttons }) => buttons.forEach((button, index) => { button.disabled = select.disabled; button.setAttribute('aria-pressed', String(select.selectedIndex === index)); }));
    const extractButton = views.querySelector<HTMLButtonElement>('[data-extract-preset]');
    if (extractButton && extraction) extractButton.textContent = Number(extraction.value) ? 'Reinserisci album' : 'Estrai album';
  }
  const observer = new MutationObserver(refresh);
  mirrors.forEach(({ select }) => observer.observe(select, { attributes: true, attributeFilter: ['disabled'] }));
  return { slot, refresh, dispose() { observer.disconnect(); }, step(value: number) {
    doc.body.dataset.wizardStep = String(value);
    if (value === 4) doc.getElementById('summaryPanel')?.after(slot); else content.prepend(slot);
    content.scrollTop = 0; refresh();
  } };
}
