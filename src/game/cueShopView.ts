import {
  getCueDurability,
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

export function createCueCollection(wallet: PlayerWallet): DocumentFragment {
  const collection = document.createDocumentFragment();
  const orderedCues = getCuesForCollection();
  const selectedCue = orderedCues.find((cue) => cue.id === selectedCueId) ?? orderedCues[0];
  selectedCueId = selectedCue.id;

  const catalog = document.createElement('div');
  catalog.className = 'cue-catalog';

  const index = document.createElement('nav');
  index.className = 'cue-catalog-index';
  index.setAttribute('aria-label', '球杆列表');

  const indexHeader = document.createElement('div');
  indexHeader.className = 'cue-index-header';
  const indexTitle = document.createElement('strong');
  indexTitle.textContent = '全部球杆';
  const indexSort = document.createElement('span');
  indexSort.textContent = '品质 / 评分';
  indexHeader.append(indexTitle, indexSort);
  index.append(indexHeader);

  for (const rarity of RARITY_ORDER) {
    const cues = orderedCues.filter((cue) => cue.rarity === rarity);
    const group = document.createElement('section');
    group.className = `cue-index-group cue-rarity-${rarity}`;

    const heading = document.createElement('div');
    heading.className = 'cue-index-group-heading';
    const title = document.createElement('h3');
    title.textContent = RARITY_META[rarity].label;
    const count = document.createElement('span');
    count.textContent = String(cues.length).padStart(2, '0');
    heading.append(title, count);

    const list = document.createElement('div');
    list.className = 'cue-index-list';
    list.append(...cues.map((cue) => createCueListItem(
      cue,
      wallet,
      orderedCues.indexOf(cue),
      cue.id === selectedCue.id,
    )));
    group.append(heading, list);
    index.append(group);
  }

  let inspector = createCueInspector(selectedCue, wallet);
  index.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const trigger = target?.closest<HTMLButtonElement>('[data-cue-select-id]');
    if (!trigger) return;
    const cue = orderedCues.find((item) => item.id === trigger.dataset.cueSelectId);
    if (!cue) return;

    selectedCueId = cue.id;
    index.querySelectorAll<HTMLButtonElement>('[data-cue-select-id]').forEach((item) => {
      const active = item.dataset.cueSelectId === cue.id;
      item.classList.toggle('is-selected', active);
      item.setAttribute('aria-pressed', String(active));
    });

    const nextInspector = createCueInspector(cue, wallet);
    inspector.replaceWith(nextInspector);
    inspector = nextInspector;
  });

  catalog.append(index, inspector);
  collection.append(catalog);
  return collection;
}

function createCueListItem(
  cue: CueStyle,
  wallet: PlayerWallet,
  position: number,
  selected: boolean,
): HTMLButtonElement {
  const owned = wallet.unlockedCueIds.includes(cue.id);
  const equipped = wallet.equippedCueId === cue.id;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `cue-index-item cue-rarity-${cue.rarity}${selected ? ' is-selected' : ''}`;
  button.dataset.cueSelectId = cue.id;
  button.setAttribute('aria-pressed', String(selected));
  button.setAttribute('aria-label', `${cue.name}，${getCueRarityLabel(cue.rarity)}，综合 ${getCuePerformanceScore(cue)}`);
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
  score.textContent = String(getCuePerformanceScore(cue));

  button.append(serial, copy, score);
  return button;
}

function createCueInspector(cue: CueStyle, wallet: PlayerWallet): HTMLElement {
  const owned = wallet.unlockedCueIds.includes(cue.id);
  const equipped = wallet.equippedCueId === cue.id;
  const durability = owned ? getCueDurability(wallet, cue.id) : cue.durability;
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
  ownership.textContent = equipped ? '当前装备' : owned ? '已拥有' : '未拥有';
  identity.append(series, name, ownership);

  const score = document.createElement('div');
  score.className = 'cue-inspector-score';
  const scoreLabel = document.createElement('span');
  scoreLabel.textContent = '综合性能';
  const scoreValue = document.createElement('strong');
  scoreValue.textContent = String(getCuePerformanceScore(cue));
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
    createCueSpecification('力量', cue.power, `${cue.power}`),
    createCueSpecification('准度', cue.accuracy, `${cue.accuracy}`),
    createCueSpecification('加塞', cue.spin, `${cue.spin}`),
    createCueSpecification('耐久', (durability / cue.durability) * 100, `${durability}/${cue.durability}`),
  );

  const footer = document.createElement('footer');
  footer.className = 'cue-inspector-footer';
  const service = document.createElement('dl');
  service.className = 'cue-inspector-service';
  service.append(
    createCueDatum('最大耐久', String(cue.durability)),
    createCueDatum('维修费用', `${cue.repairCost.toLocaleString('zh-CN')} 金币`),
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

  inspector.append(header, stage, specifications, footer);
  return inspector;
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
