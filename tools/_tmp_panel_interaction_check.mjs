import { chromium } from 'playwright';

const inspectCenterHit = async (page, panelId) => {
  return page.evaluate(({ panelId }) => {
    const panel = document.getElementById(panelId);
    if (!panel) return { panelId, exists: false };
    const rect = panel.getBoundingClientRect();
    const x = Math.round(rect.left + (rect.width / 2));
    const y = Math.round(rect.top + Math.min(30, rect.height / 2));
    const top = document.elementFromPoint(x, y);
    return {
      panelId,
      exists: true,
      parentId: panel.parentElement?.id || null,
      rect: rect.toJSON?.() || null,
      hit: {
        x,
        y,
        topId: top?.id || null,
        topTag: top?.tagName || null,
        topClass: top?.className || null,
        insidePanel: !!(top && panel.contains(top))
      }
    };
  }, { panelId });
};

const inspectPanel = async (page, panelId, inputSelector) => {
  return page.evaluate(({ panelId, inputSelector }) => {
    const panel = document.getElementById(panelId);
    const input = document.querySelector(inputSelector);
    const menuLayer = document.getElementById('intuition_menu_layer');
    const menuLayerV2 = document.getElementById('intuition_menu_layer_v2');
    const panelStyle = panel ? window.getComputedStyle(panel) : null;
    const menuStyle = menuLayer ? window.getComputedStyle(menuLayer) : null;
    const menuStyleV2 = menuLayerV2 ? window.getComputedStyle(menuLayerV2) : null;
    const info = {
      panelId,
      panelExists: !!panel,
      panelParentId: panel?.parentElement?.id || null,
      panelDisplay: panelStyle?.display || null,
      panelVisibility: panelStyle?.visibility || null,
      panelPointerEvents: panelStyle?.pointerEvents || null,
      panelZ: panelStyle?.zIndex || null,
      panelRect: panel?.getBoundingClientRect?.()?.toJSON?.() || null,
      inputExists: !!input,
      inputRect: input?.getBoundingClientRect?.()?.toJSON?.() || null,
      menuZ: menuStyle?.zIndex || null,
      menuV2Z: menuStyleV2?.zIndex || null,
      menuPointer: menuStyle?.pointerEvents || null,
      menuV2Pointer: menuStyleV2?.pointerEvents || null
    };
    if (input) {
      const r = input.getBoundingClientRect();
      const x = r.left + 8;
      const y = r.top + 8;
      const top = document.elementFromPoint(x, y);
      info.hit = {
        x,
        y,
        topId: top?.id || null,
        topClass: top?.className || null,
        topTag: top?.tagName || null,
        topParentId: top?.parentElement?.id || null
      };
    }
    return info;
  }, { panelId, inputSelector });
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  const layerDiag = await page.evaluate(() => {
    const legacy = document.getElementById('intuition_menu_layer');
    const v2 = document.getElementById('intuition_menu_layer_v2');
    const panels = document.getElementById('intuition_panel_layer');
    return {
      legacyParent: legacy?.parentElement?.id || null,
      v2Parent: v2?.parentElement?.id || null,
      panelsParent: panels?.parentElement?.id || null
    };
  });

  await page.click('#_intuition_v2_home');
  await page.waitForTimeout(550);
  const homeDiag = await inspectCenterHit(page, 'eve_user_dialog');
  await page.click('#_intuition_v2_home');
  await page.waitForTimeout(250);

  await page.click('#_intuition_v2_info');
  await page.waitForTimeout(550);
  const infoDiag = await inspectCenterHit(page, 'eve_info_dialog');
  await page.click('#_intuition_v2_info');
  await page.waitForTimeout(250);

  await page.click('#_intuition_v2_find');
  await page.waitForTimeout(700);
  const finderDiag = await inspectPanel(page, 'eve_finder_dialog', '#eve_finder_dialog__search__input');
  const finderCenterDiag = await inspectCenterHit(page, 'eve_finder_dialog');

  await page.click('#_intuition_v2_communicate');
  await page.waitForTimeout(700);
  const commDiag = await inspectPanel(page, 'eve_comm_dialog', '#eve_comm_dialog input[type="search"], #eve_comm_dialog input[data-role="comm_search_input"], #eve_comm_dialog input');
  const commCenterDiag = await inspectCenterHit(page, 'eve_comm_dialog');

  console.log(JSON.stringify({
    layerDiag,
    homeDiag,
    infoDiag,
    finderDiag,
    finderCenterDiag,
    commDiag,
    commCenterDiag
  }, null, 2));
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
