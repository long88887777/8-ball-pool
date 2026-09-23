import {
  DEFAULT_EQUIPPED_CUE_ID,
  getCueDurability,
  getEffectiveCueStyle,
  getCuePerformanceScore,
  getCuesForCollection,
  type CueRarity,
  type CueStyle,
  type PlayerWallet,
} from './economy';

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'starter'] as const;

const RARITY_META: Record<CueRarity, { label: string }> = {
  legendary: { label: '传说' },
  epic: { label: '史诗' },
  rare: { label: '稀有' },
  starter: { label: '基础' },
};

let selectedCueId: string | null = null;
let ownershipFilter: 'all' | 'owned' | 'buyable' = 'all';
let statSort: 'score' | 'power' | 'accuracy' | 'spin' = 'score';
let comparisonCueIds: string[] = [];
const CUE_PRESETS_KEY = 'pool.cuePresets.v1';

export function createCueCollection(wallet: PlayerWallet, preferredCueId?: string): DocumentFragment {
  selectedCueId = preferredCueId ?? selectedCueId ?? wallet.equippedCueId;
  const collection = document.createDocumentFragment();
  const allCues = getCuesForCollection();

  const catalog = document.createElement('div');
  catalog.className = 'cue-catalog';

  const tools = createCueCatalogTools(wallet, allCues);
  const body = document.createElement('div');
  body.className = 'cue-catalog-body';

  const renderBody = (): void => {
    const orderedCues = visibleCues(allCues, wallet);
    const selectedCue = orderedCues.find((cue) => cue.id === selectedCueId)
      ?? orderedCues.find((cue) => cue.id === preferredCueId)
      ?? orderedCues[0]
      ?? allCues[0];
    selectedCueId = selectedCue.id;

    const index = document.createElement('nav');
    index.className = 'cue-catalog-index';
    index.setAttribute('aria-label', '球杆列表');

    const indexHeader = document.createElement('div');
    indexHeader.className = 'cue-index-header';
    const indexTitle = document.createElement('strong');
    indexTitle.textContent = ownershipFilter === 'owned' ? '已拥有' : ownershipFilter === 'buyable' ? '当前可购买' : '全部球杆';
    const indexSort = document.createElement('span');
    indexSort.textContent = statSort === 'score' ? '综合' : statSort === 'power' ? '力量' : statSort === 'accuracy' ? '准度' : '加塞';
    indexHeader.append(indexTitle, indexSort);
    index.append(indexHeader);

    for (const rarity of statSort === 'score' ? RARITY_ORDER : ['all'] as const) {
      const cues = rarity === 'all' ? orderedCues : orderedCues.filter((cue) => cue.rarity === rarity);
      if (cues.length === 0) continue;
      const group = document.createElement('section');
      group.className = `cue-index-group cue-rarity-${rarity}`;

      const heading = document.createElement('div');
      heading.className = 'cue-index-group-heading';
      const title = document.createElement('h3');
      title.textContent = rarity === 'all' ? '属性排行' : RARITY_META[rarity].label;
      const count = document.createElement('span');
      count.textContent = String(cues.length).padStart(2, '0');
      heading.append(title, count);

      const list = document.createElement('div');
      list.className = 'cue-index-list';
      list.append(...cues.map((cue) => createCueListItem(
        cue,
        wallet,
        allCues.indexOf(cue),
        cue.id === selectedCue.id,
      )));
      group.append(heading, list);
      index.append(group);
    }

    body.replaceChildren(index, createCueInspector(selectedCue, wallet, allCues));
  };

  catalog.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const filter = target?.closest<HTMLButtonElement>('[data-cue-filter]');
    if (filter) {
      ownershipFilter = filter.dataset.cueFilter as typeof ownershipFilter;
      tools.querySelectorAll('[data-cue-filter]').forEach((item) => item.classList.toggle('is-active', item === filter));
      renderBody();
      return;
    }
    const sort = target?.closest<HTMLButtonElement>('[data-cue-sort]');
    if (sort) {
      statSort = sort.dataset.cueSort as typeof statSort;
      tools.querySelectorAll('[data-cue-sort]').forEach((item) => item.classList.toggle('is-active', item === sort));
      renderBody();
      return;
    }
    const compare = target?.closest<HTMLButtonElement>('[data-cue-compare-id]');
    if (compare) {
      const cueId = compare.dataset.cueCompareId!;
      comparisonCueIds = comparisonCueIds.includes(cueId)
        ? comparisonCueIds.filter((id) => id !== cueId)
        : [...comparisonCueIds.slice(-1), cueId];
      renderBody();
      return;
    }
    const preset = target?.closest<HTMLButtonElement>('[data-cue-preset-slot]');
    if (preset && selectedCueId) {
      const slot = Number(preset.dataset.cuePresetSlot);
      saveCuePreset(slot, selectedCueId);
      const cue = allCues.find((item) => item.id === selectedCueId);
      if (cue) {
        preset.textContent = `已保存到预设 ${slot + 1}`;
        const stripButton = tools.querySelectorAll<HTMLButtonElement>('[data-cue-preset-id]')[slot];
        if (stripButton) {
          stripButton.textContent = `预设 ${slot + 1} · ${cue.name}`;
          stripButton.dataset.cuePresetId = cue.id;
          stripButton.dataset.cueAction = 'equip';
          stripButton.dataset.cueId = cue.id;
          stripButton.disabled = !wallet.unlockedCueIds.includes(cue.id);
        }
      }
      return;
    }
    const presetEquip = target?.closest<HTMLButtonElement>('[data-cue-preset-id]');
    if (presetEquip?.dataset.cuePresetId) {
      selectedCueId = presetEquip.dataset.cuePresetId;
      renderBody();
      return;
    }
    const trigger = target?.closest<HTMLButtonElement>('[data-cue-select-id]');
    if (!trigger) return;
    const cue = allCues.find((item) => item.id === trigger.dataset.cueSelectId);
    if (!cue) return;

    selectedCueId = cue.id;
    renderBody();
  });

  catalog.append(tools, body);
  renderBody();
  collection.append(catalog);
  return collection;
}

function visibleCues(cues: CueStyle[], wallet: PlayerWallet): CueStyle[] {
  const filtered = cues.filter((cue) => {
    const owned = wallet.unlockedCueIds.includes(cue.id);
    if (ownershipFilter === 'owned') return owned;
    if (ownershipFilter === 'buyable') return !owned && cue.price <= wallet.coins;
    return true;
  });
  const value = (cue: CueStyle): number => statSort === 'score'
    ? getCuePerformanceScore(cue)
    : cue[statSort];
  return [...filtered].sort((a, b) => value(b) - value(a));
}

function createCueCatalogTools(wallet: PlayerWallet, cues: CueStyle[]): HTMLElement {
  const tools = document.createElement('div');
  tools.className = 'cue-catalog-tools';
  const filters = document.createElement('div');
  filters.className = 'cue-tool-group';
  filters.setAttribute('aria-label', '收藏筛选');
  ([['all', '全部'], ['owned', '已拥有'], ['buyable', '可购买']] as const).forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cueFilter = value;
    button.className = ownershipFilter === value ? 'is-active' : '';
    button.textContent = label;
    filters.append(button);
  });
  const sorts = document.createElement('div');
  sorts.className = 'cue-tool-group';
  sorts.setAttribute('aria-label', '属性排序');
  ([['score', '综合'], ['power', '力量'], ['accuracy', '准度'], ['spin', '加塞']] as const).forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cueSort = value;
    button.className = statSort === value ? 'is-active' : '';
    button.textContent = label;
    sorts.append(button);
  });
  const presets = document.createElement('div');
  presets.className = 'cue-preset-strip';
  readCuePresets().forEach((cueId, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cuePresetId = cueId ?? '';
    const cue = cues.find((item) => item.id === cueId);
    button.textContent = cue ? `预设 ${index + 1} · ${cue.name}` : `预设 ${index + 1} · 空`;
    button.disabled = !cue || !wallet.unlockedCueIds.includes(cue.id);
    if (cue) {
      button.dataset.cueAction = 'equip';
      button.dataset.cueId = cue.id;
    }
    presets.append(button);
  });
  tools.append(filters, sorts, presets);
  return tools;
}

function createCueListItem(
  cue: CueStyle,
  wallet: PlayerWallet,
  position: number,
  selected: boolean,
): HTMLButtonElement {
  const owned = wallet.unlockedCueIds.includes(cue.id);
  const equipped = wallet.equippedCueId === cue.id;
  const effectiveCue = owned ? getEffectiveCueStyle(wallet, cue.id) : cue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `cue-index-item cue-rarity-${cue.rarity}${selected ? ' is-selected' : ''}`;
  button.dataset.cueSelectId = cue.id;
  button.setAttribute('aria-pressed', String(selected));
  button.setAttribute('aria-label', `${cue.name}，${getCueRarityLabel(cue.rarity)}，综合 ${getCuePerformanceScore(effectiveCue)}`);
  setCueColors(button, cue);

  const serial = document.createElement('span');
  serial.className = 'cue-index-serial';
  serial.textContent = String(position + 1).padStart(2, '0');

  const copy = document.createElement('span');
  copy.className = 'cue-index-copy';
  const name = document.createElement('strong');
  name.textContent = cue.name;
  const status = document.createElement('small');
  status.textContent = equipped
    ? '当前装备'
    : owned
      ? '已收藏'
      : `${cue.price.toLocaleString('zh-CN')} 金币`;
  copy.append(name, status);

  const score = document.createElement('span');
  score.className = 'cue-index-score';
  score.textContent = String(getCuePerformanceScore(effectiveCue));

  button.append(serial, copy, score);
  return button;
}

function createCueInspector(cue: CueStyle, wallet: PlayerWallet, allCues: CueStyle[]): HTMLElement {
  const owned = wallet.unlockedCueIds.includes(cue.id);
  const equipped = wallet.equippedCueId === cue.id;
  const durability = owned ? getCueDurability(wallet, cue.id) : cue.durability;
  const effectiveCue = owned ? getEffectiveCueStyle(wallet, cue.id) : cue;
  const usingFallback = effectiveCue.id !== cue.id;
  const inspector = document.createElement('article');
  inspector.className = `cue-inspector cue-rarity-${cue.rarity}`;
  inspector.dataset.activeCueId = cue.id;
  setCueColors(inspector, cue);

  const header = document.createElement('header');
  header.className = 'cue-inspector-header';
  const identity = document.createElement('div');
  identity.className = 'cue-inspector-identity';
  const series = document.createElement('p');
  series.className = 'cue-inspector-series';
  series.textContent = `${getCueRarityLabel(cue.rarity)}球杆`;
  const name = document.createElement('h3');
  name.textContent = cue.name;
  const ownership = document.createElement('p');
  ownership.className = 'cue-inspector-ownership';
  ownership.textContent = usingFallback
    ? `${equipped ? '当前装备' : '已拥有'} · 未维修，属性按彗星尾迹`
    : equipped ? '当前装备' : owned ? '已拥有' : '未拥有';
  identity.append(series, name, ownership);

  const score = document.createElement('div');
  score.className = 'cue-inspector-score';
  const scoreLabel = document.createElement('span');
  scoreLabel.textContent = '综合性能';
  const scoreValue = document.createElement('strong');
  scoreValue.textContent = String(getCuePerformanceScore(effectiveCue));
  score.append(scoreLabel, scoreValue);
  header.append(identity, score);

  const stage = document.createElement('button');
  stage.type = 'button';
  stage.className = 'cue-inspector-stage';
  stage.dataset.cuePreviewId = cue.id;
  stage.setAttribute('aria-label', `查看 ${cue.name} 全尺寸大图`);
  const image = document.createElement('img');
  image.src = cue.assetPath;
  image.alt = '';
  image.decoding = 'async';
  const zoom = document.createElement('span');
  zoom.className = 'cue-inspector-zoom';
  zoom.textContent = '查看大图';
  stage.append(image, zoom);

  const specifications = document.createElement('div');
  specifications.className = 'cue-inspector-specifications';
  specifications.append(
    createCueSpecification('力量', effectiveCue.power, `${effectiveCue.power}`),
    createCueSpecification('准度', effectiveCue.accuracy, `${effectiveCue.accuracy}`),
    createCueSpecification('加塞', effectiveCue.spin, `${effectiveCue.spin}`),
    createCueSpecification('耐久', (durability / cue.durability) * 100, `${durability}/${cue.durability}`),
  );

  const footer = document.createElement('footer');
  footer.className = 'cue-inspector-footer';
  const service = document.createElement('dl');
  service.className = 'cue-inspector-service';
  service.append(
    createCueDatum('最大耐久', String(cue.durability)),
    createCueDatum('维修费用', cue.id === DEFAULT_EQUIPPED_CUE_ID
      ? '0 金币 · 自动维修'
      : `${cue.repairCost.toLocaleString('zh-CN')} 金币`),
  );

  const purchase = document.createElement('div');
  purchase.className = 'cue-inspector-purchase';
  const price = document.createElement('div');
  price.className = 'cue-inspector-price';
  const priceLabel = document.createElement('span');
  priceLabel.textContent = owned ? '状态' : '价格';
  const priceValue = document.createElement('strong');
  priceValue.textContent = owned ? '已拥有' : `${cue.price.toLocaleString('zh-CN')} 金币`;
  price.append(priceLabel, priceValue);
  purchase.append(price, createCueActionButton(cue, wallet, durability, equipped, owned));
  footer.append(service, purchase);

  const utilities = document.createElement('div');
  utilities.className = 'cue-inspector-utilities';
  const compare = document.createElement('button');
  compare.type = 'button';
  compare.dataset.cueCompareId = cue.id;
  compare.className = comparisonCueIds.includes(cue.id) ? 'is-active' : '';
  compare.textContent = comparisonCueIds.includes(cue.id) ? '移出对比' : '加入对比';
  utilities.append(compare);
  if (owned) {
    for (let slot = 0; slot < 3; slot += 1) {
      const preset = document.createElement('button');
      preset.type = 'button';
      preset.dataset.cuePresetSlot = String(slot);
      preset.textContent = `存为预设 ${slot + 1}`;
      utilities.append(preset);
    }
  }

  const comparison = createCueComparison(wallet, allCues);

  inspector.append(header, stage, specifications, footer, utilities, comparison);
  return inspector;
}

function createCueComparison(wallet: PlayerWallet, cues: CueStyle[]): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'cue-comparison';
  const heading = document.createElement('strong');
  heading.textContent = comparisonCueIds.length < 2 ? '对比栏 · 请选择两支球杆' : '球杆对比';
  panel.append(heading);
  for (const cueId of comparisonCueIds) {
    const cue = cues.find((item) => item.id === cueId);
    if (!cue) continue;
    const effective = wallet.unlockedCueIds.includes(cue.id) ? getEffectiveCueStyle(wallet, cue.id) : cue;
    const item = document.createElement('div');
    item.className = 'cue-comparison-item';
    const name = document.createElement('b');
    name.textContent = cue.name;
    const stats = document.createElement('span');
    stats.textContent = `力量 ${effective.power} · 准度 ${effective.accuracy} · 加塞 ${effective.spin}`;
    item.append(name, stats);
    panel.append(item);
  }
  return panel;
}

function readCuePresets(): Array<string | null> {
  try {
    const raw = window.localStorage.getItem(CUE_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (Array.isArray(parsed)) {
      return [0, 1, 2].map((index) => typeof parsed[index] === 'string' ? parsed[index] : null);
    }
  } catch {
    // Empty presets are a safe fallback in privacy-restricted browsers.
  }
  return [null, null, null];
}

function saveCuePreset(slot: number, cueId: string): void {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
  const presets = readCuePresets();
  presets[slot] = cueId;
  try {
    window.localStorage.setItem(CUE_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // The active shop still works even when presets cannot persist.
  }
}

function createCueActionButton(
  cue: CueStyle,
  wallet: PlayerWallet,
  durability: number,
  equipped: boolean,
  owned: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cue-inspector-action';
  button.dataset.cueId = cue.id;

  if (owned && durability <= 0) {
    button.textContent = wallet.coins >= cue.repairCost ? `维修 · ${cue.repairCost}` : '维修金币不足';
    button.dataset.cueAction = 'repair';
    button.disabled = wallet.coins < cue.repairCost;
  } else if (equipped) {
    button.textContent = '当前装备';
    button.disabled = true;
  } else if (owned) {
    button.textContent = '装备';
    button.dataset.cueAction = 'equip';
  } else {
    button.textContent = wallet.coins >= cue.price
      ? '购买并装备'
      : `还差 ${(cue.price - wallet.coins).toLocaleString('zh-CN')} 金币`;
    button.dataset.cueAction = 'buy';
    button.disabled = wallet.coins < cue.price;
  }

  return button;
}

function createCueSpecification(label: string, percent: number, value: string): HTMLElement {
  const specification = document.createElement('div');
  specification.className = 'cue-specification';
  const heading = document.createElement('div');
  const name = document.createElement('span');
  name.textContent = label;
  const amount = document.createElement('strong');
  amount.textContent = value;
  heading.append(name, amount);
  const track = document.createElement('i');
  track.style.setProperty('--cue-stat-value', `${Math.max(0, Math.min(100, percent))}%`);
  specification.append(heading, track);
  return specification;
}

function createCueDatum(label: string, value: string): HTMLElement {
  const datum = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  datum.append(term, description);
  return datum;
}

export function getCueRarityLabel(rarity: CueStyle['rarity']): string {
  return RARITY_META[rarity].label;
}

function setCueColors(element: HTMLElement, cue: CueStyle): void {
  element.style.setProperty('--cue-shaft', cssColor(cue.shaftColor));
  element.style.setProperty('--cue-forearm', cssColor(cue.forearmColor));
  element.style.setProperty('--cue-wrap', cssColor(cue.wrapColor));
  element.style.setProperty('--cue-accent', cssColor(cue.accentColor));
  element.style.setProperty('--cue-gem', cssColor(cue.gemColor));
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
