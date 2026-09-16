// Adattatore di presentazione Mobile-First per i visualizzatori 3D.
// I controlli e gli eventi restano collegati al DOM del visualizzatore con gli handler originali.

export function installMockupWizard(doc: Document, mobile = false) {
  const content = doc.querySelector<HTMLElement>('.panel-content');
  const stage = doc.querySelector<HTMLElement>('.stage');
  if (!content || !stage) throw new Error('Interfaccia del modello non disponibile');

  const slot = doc.createElement('div');
  slot.id = 'wizard-slot';
  content.prepend(slot);

  const actionsSlot = doc.createElement('div');
  actionsSlot.id = 'wizard-actions-slot';

  const controlsSlot = doc.createElement('div');
  controlsSlot.id = 'wizard-controls-slot';

  content.parentElement?.append(actionsSlot);
  stage.append(controlsSlot);

  const download = doc.querySelector('.download-bar');
  if (download) content.append(download);

  // Nasconde input file nativi
  for (const id of ['coverUpload', 'backUpload', 'restorePhoto', 'photoStatus']) {
    const element = doc.getElementById(id);
    if (element) element.hidden = true;
    const label = doc.querySelector<HTMLElement>(`label[for="${id}"]`);
    if (label) label.hidden = true;
  }

  doc.body.dataset.wizard = 'true';
  if (mobile) doc.body.dataset.wizardMobile = 'true';

  const style = doc.createElement('style');
  style.textContent = `
    /* BASE WIZARD - MOBILE-FIRST VERTICAL SPLIT */
    body[data-wizard] {
      margin: 0;
      padding: 0;
      height: 100vh !important;
      height: 100dvh !important;
      overflow: hidden !important;
      font-family: system-ui, -apple-system, sans-serif;
      color: #243d44;
      background: #faf8f3;
      font-size: 15px;
    }
    body[data-wizard] header,
    body[data-wizard] aside > h1,
    body[data-wizard] aside > p,
    body[data-wizard] aside > nav,
    body[data-wizard] .tools,
    body[data-wizard] .view-tools,
    body[data-wizard] .hint,
    body[data-wizard] .zoom {
      display: none !important;
    }

    body[data-wizard] main {
      display: flex !important;
      flex-direction: column !important;
      height: 100vh !important;
      height: 100dvh !important;
      min-height: 0 !important;
      overflow: hidden !important;
      position: relative !important;
    }

    body[data-wizard] .workspace {
      flex: 0 0 42dvh !important;
      height: 42dvh !important;
      min-height: 190px !important;
      max-height: 46dvh !important;
      width: 100% !important;
      position: relative !important;
      display: block !important;
      background: #e9e8e0;
      overflow: hidden !important;
    }

    body[data-wizard] .stage {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      position: relative !important;
    }

    body[data-wizard] canvas#viewport,
    body[data-wizard] canvas {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      touch-action: pan-y pinch-zoom !important;
    }

    body[data-wizard] aside {
      flex: 1 1 0% !important;
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      background: #faf8f3 !important;
      border-top: 1px solid #d8ded7 !important;
      border-left: 0 !important;
      border-right: 0 !important;
      padding: 10px 14px 0 !important;
      overflow: hidden !important;
    }

    body[data-wizard] .panel-content {
      flex: 1 1 0% !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior: contain !important;
      padding: 0 2px 14px 0 !important;
    }

    /* STEP VISIBILITY ORCHESTRATION */
    body[data-wizard] .panel-content > section {
      display: none !important;
    }

    /* Step 2: Tessuto (Collezione) & Step 3: Colore (Campioni) */
    body[data-wizard][data-wizard-step="2"] #fabricPanel,
    body[data-wizard][data-wizard-step="3"] #fabricPanel {
      display: block !important;
    }

    /* Step 4: Disposizione copertina */
    body[data-wizard][data-wizard-step="4"] #detailPanel {
      display: block !important;
    }

    /* Step 5: Personalizzazione copertina (Nomi o Foto) */
    body[data-wizard][data-wizard-step="5"] #detailPanel {
      display: block !important;
    }

    /* Step 6: Struttura & Retro scrigno */
    body[data-wizard][data-wizard-step="6"] #detailPanel {
      display: block !important;
    }

    /* Step 7: Riepilogo */
    body[data-wizard][data-wizard-step="7"] #summaryPanel {
      display: block !important;
    }

    /* Dettaglio filtri interni a #detailPanel */
    body[data-wizard][data-wizard-step="4"] #detailPanel > * {
      display: none !important;
    }
    body[data-wizard][data-wizard-step="4"] #detailPanel > [data-wizard-material]:not([hidden]) {
      display: block !important;
    }

    body[data-wizard][data-wizard-step="5"] #detailPanel > * {
      display: none !important;
    }
    body[data-wizard][data-wizard-step="5"] #detailPanel > #engravingControls:not([hidden]),
    body[data-wizard][data-wizard-step="5"] #detailPanel > #photoControls:not([hidden]),
    body[data-wizard][data-wizard-step="5"] #detailPanel > details[data-wizard-crop] {
      display: block !important;
    }

    body[data-wizard][data-wizard-step="6"] #detailPanel > * {
      display: none !important;
    }
    body[data-wizard][data-wizard-step="6"] #detailPanel > [data-wizard-frame]:not([hidden]),
    body[data-wizard][data-wizard-step="6"] #detailPanel > [data-wizard-rear]:not([hidden]),
    body[data-wizard][data-wizard-step="6"] #detailPanel > #backPhotoControls:not([hidden]),
    body[data-wizard][data-wizard-step="6"] #detailPanel > details[data-wizard-crop-rear] {
      display: block !important;
    }

    /* COMPONENTI DEL WIZARD */
    body[data-wizard] #wizard-slot h3 {
      font: 600 17px/1.3 Georgia, serif;
      margin: 0 0 6px;
      color: #243d44;
    }
    body[data-wizard] #wizard-slot p {
      margin: 0 0 12px;
      color: #5c6f68;
      font-size: 13px;
      line-height: 1.45;
    }
    body[data-wizard] .wizard-validation {
      padding: 8px 12px;
      border-left: 3px solid #b97422;
      background: #fff3dc;
      color: #7b4e12;
      font-size: 12px !important;
      border-radius: 0 6px 6px 0;
      margin-bottom: 10px;
    }

    /* CARD DI SCELTA ATOMICA */
    body[data-wizard] .wizard-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      margin: 10px 0 14px;
    }
    body[data-wizard] .wizard-cards button {
      min-height: 52px;
      padding: 10px 12px;
      border: 1px solid #d2d9d4;
      border-radius: 10px;
      background: #ffffff;
      color: #243d44;
      font-size: 13px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.15s ease;
    }
    body[data-wizard] .wizard-cards button:hover {
      background: #f1f5f2;
      border-color: #517b79;
    }
    body[data-wizard] .wizard-cards button[aria-pressed="true"] {
      border: 2px solid #335e56;
      background: #eaf1ef;
      font-weight: 600;
    }

    /* FAMIGLIE TESSUTO (STEP 2) */
    body[data-wizard] .wizard-family-selector {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin: 8px 0;
    }
    body[data-wizard] .wizard-family-card {
      min-height: 58px;
      padding: 12px 14px;
      border: 1px solid #d2d9d4;
      border-radius: 10px;
      background: #ffffff;
      color: #243d44;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: all 0.15s ease;
    }
    body[data-wizard] .wizard-family-card:hover {
      border-color: #517b79;
      background: #f4f7f5;
    }
    body[data-wizard] .wizard-family-card[aria-pressed="true"] {
      border: 2px solid #335e56;
      background: #eaf1ef;
    }
    body[data-wizard] .wizard-family-card strong {
      display: block;
      font-size: 14px;
      color: #243d44;
    }
    body[data-wizard] .wizard-family-card span {
      display: block;
      font-size: 11px;
      color: #637571;
      margin-top: 2px;
    }
    body[data-wizard] .wizard-family-card .wizard-family-badge {
      font-size: 11px;
      font-weight: 600;
      color: #335e56;
      background: #dfece7;
      padding: 4px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }

    /* STEP 2 vs STEP 3 DIALOG */
    body[data-wizard][data-wizard-step="2"] .wizard-family-selector {
      display: grid !important;
    }
    body[data-wizard][data-wizard-step="2"] .material-category {
      display: none !important;
    }
    body[data-wizard][data-wizard-step="3"] .wizard-family-selector {
      display: none !important;
    }
    body[data-wizard][data-wizard-step="3"] .material-category {
      display: none !important;
      border: 0;
      padding: 0;
      margin: 0;
    }
    body[data-wizard][data-wizard-step="3"] .material-category[open] {
      display: block !important;
    }
    body[data-wizard][data-wizard-step="3"] .material-category > summary {
      display: none !important;
    }

    /* GRIGLIA COLORI (STEP 3) */
    body[data-wizard] .materials {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(95px, 1fr)) !important;
      gap: 8px !important;
      padding: 6px 0 !important;
      max-height: none !important;
    }
    body[data-wizard] .materials button {
      min-height: 70px;
      padding: 6px;
      border: 1px solid #d2d9d4;
      border-radius: 8px;
      background: #ffffff;
      color: #243d44;
      font-size: 11px;
      text-align: center;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      overflow: hidden;
      transition: all 0.15s ease;
    }
    body[data-wizard] .materials button:hover {
      border-color: #517b79;
    }
    body[data-wizard] .materials button[aria-pressed="true"] {
      border: 2px solid #335e56 !important;
      background: #eaf1ef !important;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(51, 94, 86, 0.15);
    }
    body[data-wizard] .materials .swatch {
      width: 100%;
      height: 32px;
      border-radius: 4px;
      background-size: cover;
      background-position: center;
    }

    /* CAMBIA COLLEZIONE BREADCRUMB */
    body[data-wizard] .wizard-family-breadcrumb {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 7px 10px;
      margin-bottom: 8px;
      border: 1px dashed #b7c7be;
      border-radius: 8px;
      background: #f4f6f4;
      color: #335e56;
      font-size: 12px;
      cursor: pointer;
    }

    /* CONTROLLI INCISIONE E NOMI */
    body[data-wizard] #engravingControls input,
    body[data-wizard] input:not([type=range]):not([type=checkbox]) {
      width: 100%;
      min-height: 44px;
      padding: 9px 12px;
      border: 1px solid #becbc1;
      border-radius: 8px;
      font-size: 15px;
      background: #ffffff;
      margin-bottom: 8px;
    }
    body[data-wizard] #engravingPreview {
      max-height: 120px;
      object-fit: contain;
      width: 100%;
      border-radius: 6px;
      margin-top: 6px;
    }

    /* PULSANTI FOTO */
    body[data-wizard] .wizard-photo-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 10px 0;
    }
    body[data-wizard] .wizard-photo-actions button {
      flex: 1 1 140px;
      min-height: 46px;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #527684;
      background: #ffffff;
      color: #243d44;
      font-weight: 500;
      font-size: 13px;
      cursor: pointer;
    }
    body[data-wizard] .wizard-photo-actions button:hover {
      background: #f0f5f7;
    }

    /* RITAGLIO FINE (ACCORDION) */
    body[data-wizard] details[data-wizard-crop],
    body[data-wizard] details[data-wizard-crop-rear] {
      border: 1px solid #d8ded7;
      border-radius: 8px;
      padding: 4px 10px;
      margin: 8px 0;
      background: #ffffff;
    }
    body[data-wizard] details[data-wizard-crop] > summary,
    body[data-wizard] details[data-wizard-crop-rear] > summary {
      font-size: 12px;
      color: #4a635e;
      cursor: pointer;
      padding: 8px 0;
    }

    /* RIEPILOGO & HOME */
    body[data-wizard] #summaryPanel h2 {
      display: none;
    }
    body[data-wizard] #configurationSummary {
      white-space: pre-line;
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      background: #ffffff;
      border: 1px solid #d8ded7;
      border-radius: 10px;
      margin: 8px 0;
    }
    body[data-wizard] #wizard-home {
      display: none;
      margin-top: 10px;
    }
    body[data-wizard][data-wizard-step="7"] #wizard-home {
      display: block;
    }
    body[data-wizard] .download-bar {
      display: none !important;
    }
    body[data-wizard][data-wizard-step="7"] .download-bar {
      display: block !important;
      padding-top: 8px;
    }

    /* BARRA AZIONI INFERIORE */
    body[data-wizard] #wizard-actions-slot {
      flex-shrink: 0;
      border-top: 1px solid #d8ded7;
      background: #faf8f3;
      padding: 8px 12px max(8px, env(safe-area-inset-bottom));
    }
    body[data-wizard] .wizard-mobile-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    body[data-wizard] .wizard-nav {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    body[data-wizard] .wizard-nav button {
      min-height: 44px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      cursor: pointer;
      border: 1px solid #b7c7be;
      background: #ffffff;
      color: #243d44;
    }
    body[data-wizard] .wizard-nav button:first-child {
      flex: 0 0 auto;
    }
    body[data-wizard] .wizard-nav button:last-child {
      flex: 1 1 auto;
    }
    body[data-wizard] .wizard-nav .wizard-primary {
      background: #335e56 !important;
      color: #ffffff !important;
      border-color: #335e56 !important;
      font-weight: 600 !important;
    }
    body[data-wizard] .wizard-nav .wizard-primary:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    body[data-wizard] .wizard-save {
      width: 100%;
      min-height: 40px;
      border: 0;
      background: transparent;
      color: #46666a;
      font-size: 12px;
      cursor: pointer;
    }
    body[data-wizard] .wizard-save:hover {
      text-decoration: underline;
    }

    /* CONTROLLI 3D SULLO STAGE */
    body[data-wizard] #wizard-controls-slot {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    body[data-wizard] .wizard-iconbar {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 3px;
      background: rgba(250, 248, 243, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(200, 212, 207, 0.9);
      border-radius: 9999px;
      padding: 3px 6px;
      box-shadow: 0 3px 12px rgba(36, 61, 68, 0.1);
      pointer-events: auto;
      z-index: 10;
      max-width: calc(100% - 16px);
      overflow-x: auto;
      scrollbar-width: none;
    }
    body[data-wizard] .wizard-iconbar button {
      width: 36px;
      height: 36px;
      min-height: 36px;
      border-radius: 50%;
      border: 0;
      background: transparent;
      color: #243d44;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
      flex-shrink: 0;
    }
    body[data-wizard] .wizard-iconbar button:hover,
    body[data-wizard] .wizard-iconbar button:active {
      background: rgba(0, 0, 0, 0.08);
    }
    body[data-wizard] .wizard-iconbar button span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    body[data-wizard] .wizard-help {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1px solid #d2dcd7;
      background: rgba(250, 248, 243, 0.88);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #243d44;
      pointer-events: auto;
      cursor: pointer;
      z-index: 10;
    }
    body[data-wizard] .wizard-view-message {
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 4px 9px;
      font-size: 11px;
      font-weight: 500;
      background: rgba(250, 248, 243, 0.92);
      border: 1px solid #d2dcd7;
      border-radius: 6px;
      color: #243d44;
      z-index: 10;
    }
    body[data-wizard] .wizard-gesture-guide {
      pointer-events: auto;
      position: absolute;
      top: 10px;
      left: 10px;
      right: 50px;
      max-width: 290px;
      max-height: calc(100% - 60px);
      overflow-y: auto;
      background: #faf8f3;
      border: 1px solid #c9d2cb;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(36, 61, 68, 0.2);
      padding: 12px;
      color: #243d44;
      font-size: 12px;
      z-index: 20;
    }
    body[data-wizard] .wizard-gesture-guide p {
      margin: 6px 0 10px;
      line-height: 1.5;
    }
    body[data-wizard] .wizard-gesture-guide button {
      float: right;
      background: #335e56;
      color: #ffffff;
      border: 0;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }
    body[data-wizard] .badge {
      display: none !important;
    }

    /* ADATTAMENTO RESPONSIVE PER SCHERMI DESKTOP / WIDE */
    @media (min-width: 900px) {
      body[data-wizard] main {
        flex-direction: row !important;
      }
      body[data-wizard] .workspace {
        flex: 1 1 0% !important;
        height: 100% !important;
        max-height: none !important;
      }
      body[data-wizard] aside {
        flex: 0 0 clamp(350px, 36%, 460px) !important;
        border-top: 0 !important;
        border-left: 1px solid #d8ded7 !important;
        padding: 16px 20px 0 !important;
      }
    }
  `;
  doc.head.append(style);

  // CONFIGURAZIONE SCHEDE ATOMICHE FAMIGLIE TESSUTO (STEP 2 e 3)
  const fabricPanel = doc.getElementById('fabricPanel');
  const materialsDiv = doc.getElementById('materials');
  let selectedFamily = '';
  let onFamilySelectCallback: ((family: string) => void) | null = null;

  if (fabricPanel && materialsDiv) {
    const categories = Array.from(materialsDiv.querySelectorAll<HTMLDetailsElement>('.category, .material-category'));
    const familySelector = doc.createElement('div');
    familySelector.className = 'wizard-family-selector';

    const familyDescriptions: Record<string, string> = {
      alcantara: 'Morbido, setoso e vellutato al tatto',
      cablo: 'Tessuto contemporaneo con trama a rilievo',
      city: 'Trama urbana moderna, robusta e compatta',
      mist: 'Tessuto naturale a grana fine e raffinato',
    };

    categories.forEach(cat => {
      const summary = cat.querySelector('summary');
      const text = summary?.textContent || '';
      const familyName = text.split('·')[0]?.trim() || 'Tessuto';
      const countText = text.split('·')[1]?.trim() || '';
      const key = familyName.toLowerCase();

      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'wizard-family-card';
      btn.dataset.family = familyName;
      btn.innerHTML = `
        <div>
          <strong>${familyName}</strong>
          <span>${familyDescriptions[key] || 'Collezione di rivestimenti coordinati'}</span>
        </div>
        <span class="wizard-family-badge">${countText || 'Scegli'} →</span>
      `;

      btn.onclick = () => {
        selectedFamily = familyName;
        categories.forEach(c => (c.open = false));
        cat.open = true;
        updateFamilySelection();
        onFamilySelectCallback?.(familyName);
      };

      familySelector.append(btn);

      // Aggiungi breadcrumb di ritorno all'inizio di ogni categoria per lo step 3
      const breadcrumb = doc.createElement('button');
      breadcrumb.type = 'button';
      breadcrumb.className = 'wizard-family-breadcrumb';
      breadcrumb.innerHTML = `<span>Collezione: <strong>${familyName}</strong></span><span>Cambia tessuto ↺</span>`;
      breadcrumb.onclick = () => {
        onFamilySelectCallback?.('back-to-families');
      };
      cat.prepend(breadcrumb);
    });

    fabricPanel.prepend(familySelector);

    function updateFamilySelection() {
      familySelector.querySelectorAll<HTMLButtonElement>('.wizard-family-card').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.family === selectedFamily));
      });
    }

    // Inizializza la famiglia attiva in base al materiale correntemente selezionato
    const activeMaterialBtn = materialsDiv.querySelector<HTMLButtonElement>('.materials button[aria-pressed="true"]');
    if (activeMaterialBtn) {
      const parentCat = activeMaterialBtn.closest<HTMLDetailsElement>('.category, .material-category');
      if (parentCat) {
        parentCat.open = true;
        const sumText = parentCat.querySelector('summary')?.textContent || '';
        selectedFamily = sumText.split('·')[0]?.trim() || '';
        updateFamilySelection();
      }
    } else if (categories[0]) {
      categories[0].open = true;
      const sumText = categories[0].querySelector('summary')?.textContent || '';
      selectedFamily = sumText.split('·')[0]?.trim() || '';
      updateFamilySelection();
    }
  }

  // TRASFORMAZIONE SELETTORI IN CARDS TOUCH-FRIENDLY
  const detail = doc.getElementById('detailPanel');
  const mirrors: { select: HTMLSelectElement; buttons: HTMLButtonElement[] }[] = [];

  for (const id of ['frameFinish', 'coverLayout', 'coverOptions', 'backCover']) {
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
    const cards = doc.createElement('div');
    cards.className = 'wizard-cards';
    cards.dataset[group] = 'true';
    if (id === 'frameFinish') cards.dataset.wizardFrame = 'true';
    cards.setAttribute('role', 'group');
    cards.setAttribute('aria-label', label?.textContent || id);

    const buttons = Array.from(select.options).map(option => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = option.text;
      button.onclick = () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
      };
      cards.append(button);
      return button;
    });
    select.hidden = true;
    select.after(cards);
    mirrors.push({ select, buttons });
  }

  // Raggruppamento slider foto
  for (const [ids, title, isRear] of [
    [['photoZoom', 'photoX', 'photoY'], 'Regola inquadratura e zoom copertina', false],
    [['backZoom', 'backX', 'backY'], 'Regola inquadratura foto sul retro', true],
  ] as const) {
    const first = doc.getElementById(ids[0]);
    if (!first) continue;
    const adjust = doc.createElement('details');
    adjust.dataset[isRear ? 'wizardCropRear' : 'wizardCrop'] = 'true';
    const summary = doc.createElement('summary');
    summary.textContent = title;
    adjust.append(summary);
    const firstLabel = doc.querySelector(`label[for="${ids[0]}"]`);
    (firstLabel || first).before(adjust);
    for (const id of ids) {
      const label = doc.querySelector(`label[for="${id}"]`);
      const input = doc.getElementById(id);
      if (label) adjust.append(label);
      if (input) adjust.append(input);
    }
  }

  const backPhotoControls = doc.getElementById('backPhotoControls');
  if (backPhotoControls) backPhotoControls.dataset.wizardRear = 'true';

  const home = doc.getElementById('homePanel');
  if (home) {
    const wrap = doc.createElement('details');
    wrap.id = 'wizard-home';
    const title = doc.createElement('summary');
    title.textContent = 'Vedi in casa · facoltativo';
    wrap.append(title);
    content.append(wrap);
    wrap.append(home);
    home.hidden = false;
  }

  function refresh() {
    mirrors.forEach(({ select, buttons }) =>
      buttons.forEach((button, index) => {
        button.disabled = select.disabled;
        button.setAttribute('aria-pressed', String(select.selectedIndex === index));
      }),
    );
  }

  const observer = new MutationObserver(refresh);
  mirrors.forEach(({ select }) => observer.observe(select, { attributes: true, attributeFilter: ['disabled'] }));

  let previousHome = 'sideboard';

  return {
    slot,
    actionsSlot,
    controlsSlot,
    refresh,
    dispose() {
      observer.disconnect();
    },
    onFamilySelect(callback: (family: string) => void) {
      onFamilySelectCallback = callback;
    },
    view(action: 'front' | 'back' | 'reset' | 'plus' | 'minus' | 'extract' | 'rotate') {
      const extraction = doc.getElementById('extract') as HTMLInputElement | null;
      if (action === 'extract' && extraction) {
        extraction.value = Number(extraction.value) ? '0' : '100';
        extraction.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        doc.getElementById(action)?.click();
      }
      refresh();
    },
    expanded(open: boolean) {
      doc.body.dataset.viewerExpanded = String(open);
    },
    home(open: boolean) {
      doc.body.dataset.wizardHome = String(open);
      const wrapper = doc.querySelector<HTMLDetailsElement>('#wizard-home');
      if (wrapper) wrapper.open = open;
      const select = doc.querySelector<HTMLSelectElement>('#homeScene');
      if (select && open && select.value === 'none') {
        select.value = previousHome;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (select && !open && select.value !== 'none') {
        previousHome = select.value;
        select.value = 'none';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      content.scrollTop = 0;
    },
    step(value: number) {
      doc.body.dataset.wizardStep = String(value);

      if (value === 7) {
        doc.getElementById('summaryPanel')?.after(slot);
      } else {
        content.prepend(slot);
      }

      // Auto-rotazione assistita in base alla scheda
      if (value === 4 || value === 5) {
        doc.getElementById('front')?.click();
      } else if (value === 6) {
        doc.getElementById('back')?.click();
      } else if (value === 7) {
        doc.getElementById('reset')?.click();
      }

      content.scrollTop = 0;
      refresh();
    },
  };
}
