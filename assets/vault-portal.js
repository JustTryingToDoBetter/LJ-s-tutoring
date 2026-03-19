import { apiGet, clearChildren, createEl, initPortalUX, qs, renderSkeletonCards, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

let selectedId = null;

function renderList(container, items, onSelect) {
  clearChildren(container);
  if (!items.length) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'No resources available',
      description: 'Check back later for new study vault content.'
    });
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const row = createEl('div', { className: 'list-row' });
    row.append(
      createEl('strong', { text: item.title }),
      createEl('p', { className: 'note', text: item.description || 'No description provided.' }),
      createEl('p', { className: 'note', text: `${item.category || 'General'} · Tier ${item.minimum_tier}` })
    );

    const button = createEl('button', {
      className: `button secondary${item.id === selectedId ? ' active' : ''}`,
      text: item.unlocked ? 'Open' : 'Locked',
      attrs: { type: 'button', 'aria-label': `Open ${item.title}` }
    });
    button.addEventListener('click', () => onSelect(item.id));
    row.append(button);

    frag.append(row);
  });
  container.append(frag);
}

function renderDetail(container, payload) {
  clearChildren(container);
  if (!payload?.resource) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'Select a resource',
      description: 'Choose a vault item from the left list.'
    });
    return;
  }

  const resource = payload.resource;
  const wrap = createEl('div', { className: 'list-row' });
  wrap.append(
    createEl('strong', { text: resource.title }),
    createEl('p', { className: 'note', text: `${resource.category || 'General'} · Tier ${resource.minimum_tier}` }),
    createEl('p', { text: resource.body_markdown || '' })
  );

  if (resource.locked) {
    wrap.append(createEl('p', {
      className: 'note error',
      text: 'This resource requires Premium access. Upgrade to unlock full content and assets.'
    }));
  }

  if (Array.isArray(payload.assets) && payload.assets.length) {
    const assetsTitle = createEl('strong', { text: 'Assets' });
    wrap.append(assetsTitle);
    payload.assets.forEach((asset) => {
      const line = createEl('div', { className: 'row-head' });
      line.append(
        createEl('span', { text: asset.file_name }),
        createEl('a', {
          className: 'button secondary',
          text: 'Open asset',
          attrs: {
            href: `/vault/assets/${encodeURIComponent(asset.id)}`,
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        })
      );
      wrap.append(line);
    });
  }

  container.append(wrap);
}

async function initVaultPage() {
  setActiveNav('vault');
  initPortalUX();

  const listEl = qs('#vaultList');
  const detailEl = qs('#vaultDetail');

  renderSkeletonCards(listEl, 3);
  renderSkeletonCards(detailEl, 2);

  try {
    const listData = await apiGet('/vault?page=1&pageSize=20');
    trackPortalEvent('vault_list_viewed');
    const items = listData.items || [];

    const selectResource = async (id) => {
      selectedId = id;
      try {
        const detail = await apiGet(`/vault/${encodeURIComponent(id)}`);
        trackPortalEvent('vault_resource_opened', { resourceId: id });
        qs('#vaultDetailTitle').textContent = detail.resource?.title || 'Resource details';
        renderDetail(detailEl, detail);
        renderList(listEl, items, selectResource);
      } catch (err) {
        renderStateCard(detailEl, {
          variant: 'error',
          title: 'Could not load resource',
          description: err?.message || 'Try another resource.'
        });
      }
    };

    renderList(listEl, items, selectResource);
    if (items[0]?.id) {
      await selectResource(items[0].id);
    } else {
      renderDetail(detailEl, null);
    }
  } catch {
    renderStateCard(listEl, {
      variant: 'error',
      title: 'Could not load vault',
      description: 'Please refresh and try again.'
    });
    renderStateCard(detailEl, {
      variant: 'error',
      title: 'Details unavailable',
      description: 'Select a resource after reload.'
    });
  }
}

initVaultPage();
