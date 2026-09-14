import { strict as assert } from 'node:assert';

export async function runLayoutLifecycle({ page, port }) {
  for (const mobile of [false, true]) {
    await page.goto(`http://127.0.0.1:${port}/?layout-lifecycle${mobile ? '&mobile' : ''}`);
    const lifecycleFrame = page.getByTestId('layout-lifecycle-frame');
    await lifecycleFrame.waitFor();
    const lifecycleFrameLocator = page.frameLocator('[data-testid="layout-lifecycle-frame"]');
    await lifecycleFrameLocator.locator('body[data-wizard-layout="ready"]').waitFor();
    assert.equal(
      await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="base"]').count(),
      1,
      `${mobile ? 'Mobile' : 'Desktop'} deve avere un solo blocco di stili base`,
    );
    assert.equal(
      await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="mobile"]').count(),
      mobile ? 1 : 0,
      `${mobile ? 'Mobile' : 'Desktop'} deve avere ${mobile ? 'un' : 'zero'} blocco di stili mobile`,
    );
    assert.equal(
      await lifecycleFrameLocator.locator('style[data-mockup-wizard-style="true"]').count(),
      mobile ? 2 : 1,
    );
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard="true"]').count(), 1);
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard-mobile="true"]').count(), mobile ? 1 : 0);

    for (let replacement = 1; replacement <= 2; replacement++) {
      await page.getByRole('button', { name: 'Sostituisci renderer', exact: true }).click();
      await page.getByTestId('layout-lifecycle-revision').evaluate((element, expected) => {
        if (element.getAttribute('data-revision') !== String(expected)) {
          throw new Error(`Revision renderer inattesa: ${element.getAttribute('data-revision')}`);
        }
      }, replacement);
      await lifecycleFrameLocator.locator('body[data-wizard-layout="ready"]').waitFor();
      assert.equal(
        await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="base"]').count(),
        1,
        `Il renderer ${replacement} deve avere un solo blocco di stili base`,
      );
      assert.equal(
        await lifecycleFrameLocator.locator('style[data-mockup-wizard-style-kind="mobile"]').count(),
        mobile ? 1 : 0,
        `Il renderer ${replacement} deve avere ${mobile ? 'un' : 'zero'} blocco di stili mobile`,
      );
      assert.equal(
        await lifecycleFrameLocator.locator('style[data-mockup-wizard-style="true"]').count(),
        mobile ? 2 : 1,
      );
      const disposed = await page.evaluate(() => window.__mockupLayoutLifecycle?.disposed || []);
      assert.ok(
        disposed.length >= replacement * 2,
        `Il renderer precedente ${replacement - 1} non è stato smontato: ${JSON.stringify(disposed)}`,
      );
      assert.ok(
        disposed.slice(-2).every(snapshot => (
          snapshot.wizard === null
          && snapshot.wizardLayout === null
          && snapshot.wizardMobile === null
          && snapshot.styleCount === 0
          && snapshot.baseStyleCount === 0
          && snapshot.mobileStyleCount === 0
        )),
        `Il layout precedente ${replacement - 1} ha lasciato tracce: ${JSON.stringify(disposed.slice(-2))}`,
      );
    }
    await page.getByRole('button', { name: 'Rimuovi layout', exact: true }).click();
    const manuallyDisposed = await page.evaluate(() => window.__mockupLayoutLifecycle?.disposed || []);
    assert.ok(
      manuallyDisposed.slice(-2).every(snapshot => (
        snapshot.wizard === null
        && snapshot.wizardLayout === null
        && snapshot.wizardMobile === null
        && snapshot.styleCount === 0
        && snapshot.baseStyleCount === 0
        && snapshot.mobileStyleCount === 0
      )),
      `Dispose ripetuto non idempotente: ${JSON.stringify(manuallyDisposed.slice(-2))}`,
    );
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard-layout]').count(), 0);
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard]').count(), 0);
    assert.equal(await lifecycleFrameLocator.locator('body[data-wizard-mobile]').count(), 0);
    assert.equal(await lifecycleFrameLocator.locator('style[data-mockup-wizard-style="true"]').count(), 0);
  }
}