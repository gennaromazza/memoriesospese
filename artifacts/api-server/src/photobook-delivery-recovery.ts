/** Recover a missing mockup without unlocking a queued or already-emailed book. */
export function permitsMockupDeliveryRecovery(
  bookId: string, book: any, version: number, shipment: any, labId?: string,
): boolean {
  return book?.locked === true && book.currentVersion === version && !!book.labShipmentId
    && shipment?.sourceType === 'photobook' && shipment.photobookId === bookId
    && shipment.photobookVersion === version && shipment.jobId === book.jobId
    && (!labId || shipment.labId === labId)
    && (permitsMockupAttachmentState(shipment) || permitsMockupAttachmentState(shipment, true)) && !!shipment.driveFolderId
    && !shipment.deletedFromDrive && !shipment.mockupSnapshot && !shipment.mockupDispatching
    && shipment.pageTransfer?.status !== 'running'
    && !['running', 'needs_review'].includes(shipment.photobookPageCleanup?.status);
}

export function permitsMockupAttachmentState(shipment: any, afterDispatch = false): boolean {
  return afterDispatch
    ? shipment.status === 'inviato' && !!shipment.sentAt
    : shipment.status === 'da_inviare' && !shipment.sentAt;
}
