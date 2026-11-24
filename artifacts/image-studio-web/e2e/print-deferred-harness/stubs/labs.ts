export async function getAllLabs() {
  return new URLSearchParams(window.location.search).has('labFixture') ? [{
    id: 'lab-fixture', nome: 'Laboratorio simulato', attivo: true,
    dataProcessingAgreementStatus: 'signed',
    dataProcessingAgreementSignedAt: '2026-10-03T10:00:00Z',
    dataProcessingAgreementReference: 'Accordo simulato',
  }] : [];
}