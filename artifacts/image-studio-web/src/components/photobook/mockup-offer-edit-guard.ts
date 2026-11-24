export function shouldConfirmMockupOfferEdit(dirty: boolean, alreadyConfirmed: boolean): boolean {
  return dirty && !alreadyConfirmed;
}

export function isMockupOfferEditorDisabled(params: {
  readOnly: boolean;
  busy: boolean;
  dirty: boolean;
  dirtyChangeConfirmed: boolean;
  assignmentRefreshError: boolean;
}): boolean {
  return params.readOnly
    || params.busy
    || (params.dirty && !params.dirtyChangeConfirmed)
    || params.assignmentRefreshError;
}
