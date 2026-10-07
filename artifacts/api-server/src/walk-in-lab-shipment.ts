import type { LabShipment } from '../shared/lab-types.js';

export const WALK_IN_LAB_MANIFEST_FILENAME = 'DISTINTA-ORDINE.txt';

export type WalkInOrderSnapshotData = Omit<
  NonNullable<LabShipment['walkInOrderSnapshot']>,
  'capturedAt'
>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 1;
}

export function createWalkInOrderSnapshot(
  orderId: string,
  order: Record<string, any>,
): WalkInOrderSnapshotData {
  const products = (Array.isArray(order.prodotti) ? order.prodotti : [])
    .flatMap((product: any) => {
      const name = text(product?.prodottoNome);
      if (!name) return [];

      const components = Array.isArray(product.bundleItems)
        ? product.bundleItems.flatMap((component: any) => {
            const componentName = text(component?.prodottoNome);
            return componentName
              ? [{
                  name: componentName,
                  quantity: positiveQuantity(component?.quantita),
                }]
              : [];
          })
        : [];
      const detail =
        text(product?.descrizione) ||
        text(product?.descrizionePersonalizzata) ||
        text(product?.note);

      return [{
        name,
        quantity: positiveQuantity(product?.quantita),
        ...(product?.isCustom === true ? { isCustom: true } : {}),
        ...(detail ? { detail } : {}),
        ...(components.length > 0 ? { components } : {}),
      }];
    });

  return {
    orderId,
    orderTitle: text(order.nomeEvento) || `Ordine walk-in ${orderId}`,
    customerName: text(order.nomeCliente) || 'Cliente non specificato',
    orderDescription: text(order.note),
    products,
  };
}

export function buildWalkInLabManifest(
  snapshot: WalkInOrderSnapshotData,
  shipment: Pick<LabShipment, 'descrizione' | 'labNote' | 'files'>,
): string {
  const lines = [
    'DISTINTA PER IL LABORATORIO',
    '===========================',
    '',
    `Riferimento ordine: ${snapshot.orderId}`,
    `Ordine: ${snapshot.orderTitle}`,
    `Cliente: ${snapshot.customerName}`,
    ...(shipment.descrizione ? [`Invio: ${shipment.descrizione}`] : []),
    '',
    'PRODOTTI E LAVORAZIONI',
    '----------------------',
  ];

  if (snapshot.products.length === 0) {
    lines.push('Nessun prodotto presente nell’ordine.');
  } else {
    snapshot.products.forEach((product, index) => {
      const suffix = product.isCustom ? ' (personalizzato)' : '';
      lines.push(`${index + 1}. ${product.quantity} × ${product.name}${suffix}`);
      if (product.detail) lines.push(`   Dettagli: ${product.detail}`);
      product.components?.forEach((component) => {
        lines.push(`   - ${component.quantity} × ${component.name}`);
      });
    });
  }

  lines.push(
    '',
    'DESCRIZIONE INSERITA NELL’ORDINE',
    '-------------------------------',
    snapshot.orderDescription || 'Nessuna descrizione aggiuntiva inserita.',
  );

  if (shipment.labNote?.trim()) {
    lines.push(
      '',
      'NOTE AGGIUNTIVE PER IL LABORATORIO',
      '----------------------------------',
      shipment.labNote.trim(),
    );
  }

  const attachments = (shipment.files || []).filter(
    (file) => file.kind !== 'manifest' && file.name !== WALK_IN_LAB_MANIFEST_FILENAME,
  );
  lines.push('', 'MATERIALI ALLEGATI', '------------------');
  if (attachments.length === 0) {
    lines.push('Nessun file allegato.');
  } else {
    attachments.forEach((file) => lines.push(`- ${file.name}`));
  }

  lines.push(
    '',
    'Istruzioni e prodotti riportati sono una copia dell’ordine al momento della creazione dell’invio.',
    '',
  );
  return lines.join('\r\n');
}
