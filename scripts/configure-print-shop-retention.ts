import { storage } from '../server/firebase-admin.js';

const RETENTION_DAYS = 90;
const PREFIX = 'print-orders/';
const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const bucket = storage.bucket();
  const [metadata] = await bucket.getMetadata();
  const rules = Array.isArray(metadata.lifecycle?.rule)
    ? [...metadata.lifecycle.rule]
    : [];
  const alreadyConfigured = rules.some((rule: any) =>
    rule?.action?.type === 'Delete' &&
    Number(rule?.condition?.daysSinceCustomTime) === RETENTION_DAYS &&
    Array.isArray(rule?.condition?.matchesPrefix) &&
    rule.condition.matchesPrefix.includes(PREFIX),
  );
  const desiredRule = {
    action: { type: 'Delete' },
    condition: {
      daysSinceCustomTime: RETENTION_DAYS,
      matchesPrefix: [PREFIX],
    },
  };

  console.log(JSON.stringify({
    bucket: bucket.name,
    mode: apply ? 'apply' : 'dry-run',
    alreadyConfigured,
    existingRuleCount: rules.length,
    desiredRule,
  }, null, 2));

  if (!apply || alreadyConfigured) return;
  await bucket.setMetadata({
    lifecycle: { rule: [...rules, desiredRule] },
  } as any);
  console.log('Regola lifecycle aggiunta senza modificare le regole esistenti.');
}

main().catch(error => {
  console.error('Configurazione retention GCS fallita:', error);
  process.exitCode = 1;
});
