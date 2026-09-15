// Adattatore di sola presentazione per i renderer same-origin esistenti.
// I controlli restano nel loro documento, con gli handler e gli ID originali.
import type { MockupWizardStepDefinition } from '@shared/mockup-catalog';

export function installMockupWizard(doc: Document, mobile = false) {
  let content = doc.querySelector<HTMLElement>('.panel-content');
  const stage = doc.querySelector<HTMLElement>('.stage');
  if (!content) {
    const aside = doc.querySelector<HTMLElement>('aside');
    const sections = aside ? Array.from(aside.querySelectorAll<HTMLElement>(':scope > section')) : [];
    const firstSection = sections[0];
    if (aside && firstSection && sections.length) {
      content = doc.createElement('div');
      content.className = 'panel-content';
      firstSection.before(content);
      sections.forEach(section => content?.append(section));
    }
  }
  if (!content || !stage) throw new Error('Interfaccia del modello non disponibile');
  const download = doc.getElementById('downloadClient');
  if (download && !download.closest('.download-bar')) {
    const bar = doc.createElement('div');
    bar.className = 'download-bar';
    download.before(bar);
    bar.append(download);
    const status = doc.getElementById('downloadStatus');
    if (status && status.parentElement !== bar) bar.append(status);
  }
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
  doc.body.dataset.wizardLayout = 'installing';
  if (mobile) doc.body.dataset.wizardMobile = 'true';
  const style = doc.createElement('style');
  style.dataset.mockupWizardStyle = 'true';
  style.dataset.mockupWizardStyleKind = 'base';
  style.textContent = `
    body[data-wizard] {height:100dvh;overflow:hidden;font-size:16px}
    body[data-wizard] header,body[data-wizard] aside>h1,body[data-wizard] aside>p,body[data-wizard] aside>nav,
    body[data-wizard] .tools,body[data-wizard] .view-tools,body[data-wizard] .hint,body[data-wizard] .zoom {display:none!important}
    body[data-wizard] main {display:grid!important;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(120px,40%) minmax(0,1fr);height:100%;min-height:0}
    body[data-wizard] .workspace {grid-row:1;display:block;min-height:0}
    body[data-wizard] .stage {height:100%;min-height:0;position:relative}
      body[data-wizard] aside {grid-row:2;padding:14px;min-height:0;overflow:hidden;border:0}
      body[data-wizard] .workspace {background:#edf1ec;position:relative}
      body[data-wizard] .workspace:before {content:'ANTEPRIMA LIVE  ·  clicca e trascina per ruotare';position:absolute;top:12px;left:14px;z-index:2;padding:6px 9px;border:1px solid #d9dfd8;border-radius:999px;background:#fffffff0;color:#335e56;font-size:10px;font-weight:800;letter-spacing:.07em;pointer-events:none}
      body[data-wizard] aside {background:#fff!important;border-left:1px solid #d8ded7}
      body[data-wizard] aside:before {content:'CONFIGURA IL MODELLO';display:block;padding:0 0 10px;border-bottom:1px solid #e1e6df;color:#335e56;font-size:10px;font-weight:800;letter-spacing:.1em}
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
    body[data-wizard][data-wizard-panel="summary"] .download-bar {display:block}
    body[data-wizard] .panel-content>section[data-wizard-panel-active="false"],
    body[data-wizard] #detailPanel>[data-wizard-panel-active="false"] {display:none!important}
    body[data-wizard] #wizard-home {display:none}
    body[data-wizard][data-wizard-panel="summary"] #wizard-home {display:block}
    body[data-wizard] #wizard-home section {display:block}
    body[data-wizard] #wizard-slot h3 {font:500 20px Georgia,serif;margin:0 0 12px}
    body[data-wizard] #wizard-slot .wizard-model {display:block;width:100%;margin:8px 0;text-align:left}
    body[data-wizard] #wizard-slot .wizard-model small {display:block;margin-top:4px}
    body[data-wizard] #wizard-slot .wizard-photo-actions {display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    body[data-wizard] #wizard-slot .wizard-photo-actions button {flex:1}
    body[data-wizard] #wizard-slot p {margin:8px 0 12px}
     body[data-wizard] aside{background:#fff!important;border-left:1px solid #d9dfd8!important}
     body[data-wizard] .panel-content{padding:0 5px 14px 0!important}
     body[data-wizard] #wizard-slot{padding:12px 0 4px}
     body[data-wizard] #wizard-slot h3{margin:0 0 7px!important;color:#263d3b;font:600 20px/1.15 Georgia,serif!important}
     body[data-wizard] #wizard-slot>p{color:#71807b;font-size:12px!important;line-height:1.45}
     body[data-wizard] .wizard-step-heading{color:#263d3b;border-bottom:1px solid #e1e6df}
     body[data-wizard] .wizard-step-heading strong{font-weight:700}
     body[data-wizard] .wizard-step-heading span{color:#335e56;font-weight:700;letter-spacing:.04em}
     body[data-wizard] .wizard-cards button,body[data-wizard] .wizard-model{border:1px solid #d9dfd8;border-radius:10px;background:#fff;color:#263d3b;transition:border-color .15s,background .15s,box-shadow .15s}
     body[data-wizard] .wizard-cards button:hover,body[data-wizard] .wizard-model:hover,body[data-wizard] .wizard-cards button[aria-pressed=true],body[data-wizard] .wizard-model[aria-pressed=true]{border-color:#335e56;background:#f3f5f0;box-shadow:0 0 0 2px #335e5618}
      body[data-wizard] .wizard-photo-actions button,body[data-wizard] .download-bar #downloadClient{border:1px solid #d9dfd8;border-radius:9px;background:#fff;color:#335e56;font-weight:600}
      body[data-wizard] #wizard-slot .wizard-summary-card{display:flex;flex-direction:column;gap:9px;border:1px solid #d9dfd8;border-radius:14px;padding:18px;background:linear-gradient(145deg,#f3f5f0,#fbfaf6);color:#263d3b}
      body[data-wizard] #wizard-slot .wizard-summary-kicker{color:#335e56;font-size:10px;font-weight:800;letter-spacing:.12em}
      body[data-wizard] #wizard-slot .wizard-summary-card h3{margin:0!important;font:600 24px/1.1 Georgia,serif!important}
      body[data-wizard] #wizard-slot .wizard-summary-card>p{margin:0!important;color:#52645e;font-size:13px!important;line-height:1.5}
      body[data-wizard] #wizard-slot .wizard-summary-card .wizard-summary-status{padding:8px 10px!important;border-radius:8px;background:#e8f0eb;color:#335e56;font-size:11px!important;font-weight:700}
      body[data-wizard] #wizard-slot .wizard-summary-card .wizard-summary-note{color:#71807b;font-size:11px!important}
      body[data-wizard] #wizard-slot .wizard-summary-card--readonly{border-color:#c8dbe4;background:linear-gradient(145deg,#eef6f8,#fbfaf6)}
      body[data-wizard] #wizard-slot .wizard-summary-card--readonly .wizard-summary-status{background:#eef6f8;color:#526e79}
      body[data-wizard] #wizard-slot .wizard-summary-details{display:flex;flex-direction:column;gap:7px;margin:3px 0 0}
      body[data-wizard] #wizard-slot .wizard-summary-details div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #e1e6df;padding-bottom:7px}
      body[data-wizard] #wizard-slot .wizard-summary-details dt{color:#71807b;font-size:10px;text-transform:uppercase}
      body[data-wizard] #wizard-slot .wizard-summary-details dd{margin:0;color:#263d3b;font-size:11px;font-weight:700;text-align:right}
      body[data-wizard] #wizard-slot .wizard-summary-card details{margin-top:3px;border-top:1px solid #d9dfd8;padding-top:8px}
      body[data-wizard] #wizard-slot .wizard-summary-card details summary{min-height:36px;padding:7px 0;color:#335e56;font-size:12px;font-weight:700}
      body[data-wizard] #wizard-slot .wizard-summary-card details button{border:1px solid #b9cbc0;border-radius:8px;background:#fff;color:#335e56;font-weight:700}
      body[data-wizard][data-wizard-readonly=true][data-wizard-panel=summary] .panel-content>section{display:none!important}
      body[data-wizard][data-wizard-readonly=true][data-wizard-panel=summary] #wizard-slot{display:block!important}
      body[data-wizard][data-wizard-readonly=true] .download-bar{display:block!important;margin-top:10px;border-top:1px solid #d9dfd8;padding-top:10px}
      body[data-wizard][data-wizard-readonly=true] .download-bar #downloadClient{min-height:44px;background:#335e56;color:#fff}
     body[data-wizard] .wizard-views{gap:3px!important;padding:4px;border:1px solid #ffffffb8;border-radius:12px;background:#fffffff0;box-shadow:0 8px 20px #263d3b18}
     body[data-wizard] .wizard-views button{min-height:36px;border:0;border-radius:8px;color:#596b65;background:transparent;font-size:11px;font-weight:600}
     body[data-wizard] .wizard-views button:hover{color:#234943;background:#eef2ed}
      @media(min-width:768px){body[data-wizard] main{grid-template-columns:minmax(0,1.4fr) minmax(300px,1fr);grid-template-rows:minmax(0,1fr)}body[data-wizard] aside{grid-row:1;grid-column:2;padding:22px}body[data-wizard] .workspace{grid-column:1}}
    @media(max-width:767px) and (max-height:380px){body[data-wizard] main{grid-template-rows:minmax(100px,35%) minmax(0,1fr)}body[data-wizard] .wizard-views button:nth-child(3){display:none}}
  `;
  doc.head.append(style);
  let mobileStyle: HTMLStyleElement | undefined;
  if (mobile) {
    mobileStyle = doc.createElement('style');
    mobileStyle.dataset.mockupWizardStyle = 'true';
    mobileStyle.dataset.mockupWizardStyleKind = 'mobile';
    mobileStyle.textContent = `
       body[data-wizard-mobile] main {grid-template-columns:minmax(0,1fr) clamp(250px,42%,410px)!important;grid-template-rows:minmax(0,1fr)!important;height:100%!important;min-height:0!important;box-sizing:border-box}
      body[data-wizard-mobile][data-viewer-expanded=true] main {grid-template-columns:minmax(0,1fr)!important}
      body[data-wizard-mobile][data-viewer-expanded=true] aside {display:none!important}
      body[data-wizard-mobile] .wizard-validation {padding:8px;border-left:3px solid #b97422;background:#fff3dc;font-size:12px!important}
       body[data-wizard-mobile] .workspace {grid-column:1;grid-row:1;display:block!important;overflow:hidden;position:relative;background:#edf1ec}
       body[data-wizard-mobile] .workspace:before {content:'ANTEPRIMA LIVE  ·  trascina per ruotare';position:absolute;top:10px;left:12px;z-index:2;padding:5px 8px;border:1px solid #d9dfd8;border-radius:999px;background:#fffffff0;color:#335e56;font-size:9px;font-weight:800;letter-spacing:.08em;pointer-events:none}
      body[data-wizard-mobile] .stage {position:relative!important;min-height:0!important;height:100%!important}
        body[data-wizard-mobile] aside {grid-column:2;grid-row:1;display:flex;flex-direction:column;height:100%!important;min-height:0!important;box-sizing:border-box;padding:12px 14px 0!important;border-left:1px solid #d8ded7;background:#fff!important;overflow:hidden!important}
       body[data-wizard-mobile] aside:before {content:'CONFIGURA IL MODELLO';display:block;flex:0 0 auto;padding:0 0 8px;border-bottom:1px solid #e1e6df;color:#335e56;font-size:10px;font-weight:800;letter-spacing:.1em}
       body[data-wizard-mobile] .panel-content {flex:1;min-height:0!important;max-height:none!important;scrollbar-gutter:auto;padding:0 3px 10px 0}
      body[data-wizard-mobile] .badge {display:none}
      body[data-wizard-mobile] button {font-size:13px}
      body[data-wizard-mobile] .wizard-cards {gap:6px;margin:6px 0}
      body[data-wizard-mobile] .wizard-cards button {flex:1 1 100%;padding:9px;font-size:13px}
      body[data-wizard-mobile] .download-bar {display:none!important}
       body[data-wizard-mobile][data-wizard-panel="summary"] .download-bar {display:block!important}
       body[data-wizard-mobile] .panel-content>section[data-wizard-panel-active="false"],
       body[data-wizard-mobile] #detailPanel>[data-wizard-panel-active="false"] {display:none!important}
      body[data-wizard-mobile] #wizard-slot h3 {font-size:17px;margin-bottom:6px}
       body[data-wizard-mobile] #wizard-slot .wizard-summary-card {gap:6px;padding:12px}
       body[data-wizard-mobile] #wizard-slot .wizard-summary-card h3 {font-size:18px!important}
       body[data-wizard-mobile] #wizard-slot .wizard-summary-card>p {font-size:12px!important}
       body[data-wizard-mobile] .wizard-readonly-actions {display:flex;flex-direction:column;gap:7px;border-top:1px solid #d9dfd8;padding-top:8px}
       body[data-wizard-mobile] .wizard-readonly-copy {display:flex;flex-direction:column;gap:2px;padding:2px 0;color:#52645e;font-size:11px}
       body[data-wizard-mobile] .wizard-readonly-copy strong {color:#263d3b;font:600 17px/1.1 Georgia,serif}
       body[data-wizard-mobile] .wizard-readonly-copy span {color:#335e56;font-size:9px;font-weight:800;letter-spacing:.12em}
       body[data-wizard-mobile] .wizard-readonly-copy p {margin:0!important;font-size:11px!important}
      body[data-wizard-mobile] #wizard-slot p {font-size:13px;margin:6px 0}
      body[data-wizard-mobile] .materials {grid-template-columns:repeat(2,minmax(0,1fr))}
      body[data-wizard-mobile] #fabricPanel>h2 {display:none}
      body[data-wizard-mobile] .category summary,body[data-wizard-mobile] .material-category summary {cursor:pointer;list-style:disclosure-closed;padding:10px}
      body[data-wizard-mobile] details[open]>summary {list-style:disclosure-open}
      body[data-wizard][data-wizard-mobile] #wizard-home {display:none}
      body[data-wizard][data-wizard-mobile][data-wizard-home="true"] #wizard-home {display:block}
      body[data-wizard-mobile][data-wizard-home="true"] #wizard-home>summary {display:none}
      body[data-wizard-mobile][data-wizard-home="true"] #wizard-slot,
      body[data-wizard-mobile][data-wizard-home="true"] .download-bar,
      body[data-wizard-mobile][data-wizard-home="true"] #wizard-controls-slot {display:none!important}
       body[data-wizard][data-wizard-mobile][data-wizard-home="true"] :is(#fabricPanel,#detailPanel,#summaryPanel) {display:none!important}
      body[data-wizard-mobile] #summaryPanel>h2, body[data-wizard-mobile] #photoStatus {display:none}
      body[data-wizard-mobile] #engravingPreview {max-height:110px;object-fit:contain}
       body[data-wizard-mobile] #wizard-actions-slot {flex-shrink:0;border-top:1px solid #d8ded7;background:#fbfaf6;margin:0 -14px;padding:8px 14px}
       body[data-wizard-mobile] .wizard-mobile-actions {display:flex;flex-direction:column;gap:5px}
       body[data-wizard-mobile] .wizard-step-heading {display:flex;align-items:center;gap:8px;position:sticky;top:0;z-index:1;background:#fff;padding:7px 0 10px;border-bottom:1px solid #e1e6df;font-size:13px}
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
        body[data-wizard-mobile] .wizard-iconbar {position:absolute;bottom:10px;left:10px;right:10px;height:44px;box-sizing:border-box;display:flex;gap:4px;padding:0;border:1px solid #ffffffb8;border-radius:12px;background:#fffffff0;box-shadow:0 8px 20px #263d3b18;pointer-events:auto;overflow-x:auto;scrollbar-width:none}
       body[data-wizard-mobile] .wizard-iconbar button {flex-shrink:0}
        body[data-wizard-mobile] .wizard-iconbar button,body[data-wizard-mobile] .wizard-help {position:relative;width:auto;min-width:43px;height:44px;min-height:44px;gap:5px;padding:0 9px!important;border:0!important;border-radius:8px!important;background:transparent;display:flex;align-items:center;justify-content:center;color:#596b65;font-size:10px;font-weight:600;isolation:isolate}
       body[data-wizard-mobile] .wizard-iconbar button:before,body[data-wizard-mobile] .wizard-help:before {display:none}
       body[data-wizard-mobile] .wizard-iconbar button span {position:static;width:auto;height:auto;overflow:visible;clip-path:none}
       body[data-wizard-mobile] .wizard-iconbar button:hover {background:#eef2ed}
       body[data-wizard-mobile] .wizard-iconbar button b {font-size:11px}
       body[data-wizard-mobile] .wizard-help {position:absolute;right:10px;top:10px;width:38px;min-width:38px;padding:0!important;background:#fffffff0;border:1px solid #d9dfd8!important;box-shadow:0 5px 14px #263d3b12;pointer-events:auto}
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
  const fabric = doc.getElementById('fabricPanel');
  const summaryPanel = doc.getElementById('summaryPanel');
  const mirrors: { select: HTMLSelectElement; buttons: HTMLButtonElement[] }[] = [];
  type WizardPanel = MockupWizardStepDefinition['panel'];
  const mark = (element: HTMLElement | null, panel: WizardPanel) => {
    if (!element) return;
    element.dataset.wizardPanel = panel;
    if (element.id) {
      const label = doc.querySelector<HTMLElement>(`label[for="${element.id}"]`);
      if (label) label.dataset.wizardPanel = panel;
    }
  };
  const markById = (id: string, panel: WizardPanel) => mark(doc.getElementById(id), panel);
  if (fabric) fabric.dataset.wizardPanel = 'material';
  if (summaryPanel) summaryPanel.dataset.wizardPanel = 'summary';
  if (detail) {
    detail.dataset.wizardPanel = 'detail';
    Array.from(detail.children).forEach(child => {
      const element = child as HTMLElement;
      if (element.tagName !== 'H2' && !element.dataset.wizardPanel && !element.dataset.detailTab && !element.dataset.detailPanelSection) element.dataset.wizardPanel = 'cover';
    });
  }
  markById('frameFinish', 'structure');
  markById('coverLayout', 'cover');
  markById('coverOptions', 'cover');
  markById('photoControls', 'cover');
  markById('engravingControls', 'cover');
  markById('backCover', 'box-glass');
  markById('backPhotoControls', 'box-glass');
  for (const id of ['coverUpload', 'photoStatus', 'restorePhoto', 'photoZoom', 'photoX', 'photoY', 'topText', 'bottomText', 'firstName', 'secondName']) markById(id, 'cover');
  for (const id of ['backUpload', 'backPhotoStatus', 'backZoom', 'backX', 'backY']) markById(id, 'box-glass');
  const detailPanels = new Set<WizardPanel>(['structure', 'cover', 'box-glass']);
  const detailTabs = detail ? Array.from(detail.querySelectorAll<HTMLButtonElement>('[data-detail-tab]')) : [];
  const detailSections = detail ? Array.from(detail.querySelectorAll<HTMLElement>('[data-detail-panel-section]')) : [];
  const detailPanelId = (panel: WizardPanel) => panel === 'structure' ? 'structurePanel' : panel === 'cover' ? 'coverPanel' : panel === 'box-glass' ? 'boxPanel' : '';
  const selectDetailTab = (panelId: string) => {
    detailTabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.detailTab === panelId)));
    detailSections.forEach(section => { section.hidden = section.id !== panelId; });
  };
  detailTabs.forEach(tab => tab.addEventListener('click', () => selectDetailTab(tab.dataset.detailTab || '')));
  if (detailSections.length) selectDetailTab('structurePanel');
  const syncPanel = (panel: WizardPanel) => {
    doc.body.dataset.wizardPanel = panel;
    if (fabric) { fabric.hidden = false; fabric.dataset.wizardPanelActive = String(panel === 'material'); }
    if (detail) {
      detail.hidden = false;
      detail.dataset.wizardPanelActive = String(detailPanels.has(panel));
      if (detailSections.length) selectDetailTab(detailPanelId(panel) || 'structurePanel');
      else Array.from(detail.children).forEach(child => {
        const element = child as HTMLElement;
        if (element.tagName !== 'H2' && element.dataset.wizardPanel) element.dataset.wizardPanelActive = String(element.dataset.wizardPanel === panel);
      });
    }
    if (summaryPanel) { summaryPanel.hidden = false; summaryPanel.dataset.wizardPanelActive = String(panel === 'summary'); }
  };
  for (const id of ['frameFinish', 'coverLayout', 'coverOptions', 'photoControls', 'engravingControls', 'backCover', 'backPhotoControls']) {
    const element = doc.getElementById(id);
    if (element?.dataset.wizardPanel) mark(element, element.dataset.wizardPanel as WizardPanel);
  }
  for (const id of ['frameFinish', 'coverLayout', 'coverOptions', ...(mobile ? ['backCover'] : [])]) {
    const element = doc.getElementById(id);
    if (!element || !detail?.contains(element)) continue;
    const group = element.dataset.wizardPanel || 'cover';
    const label = doc.querySelector<HTMLElement>(`label[for="${id}"]`);
    if (element.tagName !== 'SELECT') continue;
    const select = element as HTMLSelectElement;
     const cards = doc.createElement('div'); cards.className = 'wizard-cards';
     cards.dataset.wizardPanel = group;
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
  doc.body.dataset.wizardLayout = 'ready';
  let disposed = false;
  return { slot, actionsSlot, controlsSlot, refresh, dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    delete doc.body.dataset.wizard;
    delete doc.body.dataset.wizardLayout;
    delete doc.body.dataset.wizardMobile;
    delete doc.body.dataset.wizardPanel;
    delete doc.body.dataset.wizardHome;
    delete doc.body.dataset.wizardStep;
    delete doc.body.dataset.viewerExpanded;
     delete doc.body.dataset.wizardReadonly;
    style.remove();
    mobileStyle?.remove();
  },
    view(action: 'front' | 'back' | 'reset' | 'plus' | 'minus' | 'extract' | 'rotate') {
      if (action === 'extract' && extraction) { extraction.value = Number(extraction.value) ? '0' : '100'; extraction.dispatchEvent(new Event('input', { bubbles: true })); }
      else doc.getElementById(action)?.click();
      refresh();
    },
    expanded(open: boolean) { doc.body.dataset.viewerExpanded = String(open); },
    readOnly(value: boolean) { doc.body.dataset.wizardReadonly = String(value); },
    home(open: boolean) {
      if (!mobile) return;
      doc.body.dataset.wizardHome = String(open);
      const wrapper = doc.querySelector<HTMLDetailsElement>('#wizard-home'); if (wrapper) wrapper.open = open;
      const select = doc.querySelector<HTMLSelectElement>('#homeScene');
      if (select && open && select.value === 'none') { select.value = previousHome; select.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (select && !open && select.value !== 'none') { previousHome = select.value; select.value = 'none'; select.dispatchEvent(new Event('change', { bubbles: true })); }
      content.scrollTop = 0;
    }, step(value: MockupWizardStepDefinition) {
    doc.body.dataset.wizardStep = String(value.nativeStep);
    syncPanel(value.panel);
    if (value.panel === 'summary') summaryPanel?.after(slot); else content.prepend(slot);
    if (mobile && value.panel === 'box-glass') doc.getElementById('back')?.click();
    else if (mobile && value.panel === 'cover') doc.getElementById('front')?.click();
    content.scrollTop = 0; refresh();
  } };
}
