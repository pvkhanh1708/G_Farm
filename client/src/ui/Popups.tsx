import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CROP_ORDER, CROPS, CropId, CropKind, cropsUnlockedAt, ITEM_ORDER, ItemId, itemDef, levelReward, Quality, tileCap, xpToNext } from '../game/config';
import { store } from '../game/state/store';
import { ApiError } from '../game/net/api';
import { sync } from '../game/net/sync';
import { pwa } from '../game/pwa';
import { GOOGLE_CLIENT_ID, renderGoogleButton } from '../game/net/google';
import { useGameState } from './Hud';
import { ClockIcon, CloseIcon, CoinIcon, CropIcon, LockIcon, SoundIcon, SproutIcon, BarnIcon, SeedBagIcon, GearIcon, LevelStar, XpIcon, ItemIcon, MusicIcon } from './icons';
import { formatNum } from './format';
import { artUrl } from '../game/art';

export function Modal({ title, icon, tone = 'green', onClose, children, wide }: { title: string; icon: React.ReactNode; tone?: 'green' | 'orange' | 'blue'; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`panel ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className={`panel-ribbon ${tone}`}>
          <span className="panel-ribbon-icon">{icon}</span>
          {title}
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Đóng">
          <CloseIcon size={22} />
        </button>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

export const CROP_BG: Record<ItemId, string> = {
  egg: '#fff3dc', milk: '#e2f0ff',
  carrot: '#ffe2c2', wheat: '#fff1b8', tomato: '#ffd6cf', strawberry: '#ffd9e0', cabbage: '#dcf5cf',
  corn: '#fff3b0', eggplant: '#ecdcff', pumpkin: '#ffe0c0', sunflower: '#fff6c2',
  potato: '#f3e2c8', chili: '#ffd8d0', watermelon: '#d8f5d0', pineapple: '#fff0b8', cotton: '#eef0f4', lavender: '#e8dcff',
  tea: '#dcf5cf', grape: '#ecdcff', coffee: '#ffe0d8', dragonfruit: '#ffd8ea', rose: '#ffd6dc', durian: '#f4f0c0', orchid: '#f2e4ff',
  ginseng: '#f6ead0', saffron: '#ece0ff', cantaloupe: '#f8f0d6',
};

function formatDuration(sec: number) {
  if (sec < 60) return `${sec} giây`;
  const m = Math.floor(sec / 60), r = sec % 60;
  return r ? `${m} phút ${r} giây` : `${m} phút`;
}

/** Details for one seed, shown while a card is long-pressed (touch) or hovered (mouse). */
function SeedTip({ id, rect, level }: { id: CropId; rect: DOMRect; level: number }) {
  const c = CROPS[id];
  const profit = c.yield * c.sellPrice - c.seedPrice;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    // above the card when it fits, otherwise below; always inside the screen
    const el = ref.current!;
    const w = el.offsetWidth, h = el.offsetHeight, m = 10;
    const left = Math.max(m, Math.min(innerWidth - w - m, rect.left + rect.width / 2 - w / 2));
    const below = rect.top - h - 12 < m;
    setPos({ left, top: below ? rect.bottom + 12 : rect.top - h - 12, below });
  }, [rect]);
  return (
    <div ref={ref} className={`seed-tip ${pos?.below ? 'below' : ''}`} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }} role="tooltip">
      <div className="seed-tip-head">
        <CropIcon crop={id} size={34} />
        <b>{c.name}</b>
      </div>
      <KindTag kind={c.kind} />
      {c.unlockLevel > level && (
        <div className="seed-tip-lock">
          <LockIcon size={14} /> Mở khóa ở cấp {c.unlockLevel}
        </div>
      )}
      <dl>
        <dt>
          <ClockIcon size={16} /> Thời gian lớn
        </dt>
        <dd>{formatDuration(c.growSeconds)}</dd>
        <dt>Thu hoạch</dt>
        <dd>×{c.yield}</dd>
        <dt>Giá bán</dt>
        <dd>
          <CoinIcon size={14} /> {formatNum(c.sellPrice)}/cái
        </dd>
        <dt>
          <XpIcon size={14} /> Kinh nghiệm
        </dt>
        <dd>+{formatNum(c.xp)} XP</dd>
        <dt>Lãi mỗi ô</dt>
        <dd className="profit">
          <CoinIcon size={14} /> +{formatNum(profit)}
        </dd>
        <dt>Lãi / phút</dt>
        <dd className={c.kind === 'coin' ? 'best' : ''}>
          <CoinIcon size={14} /> {formatNum((profit * 60) / c.growSeconds)}
        </dd>
        <dt>XP / phút</dt>
        <dd className={c.kind === 'xp' ? 'best' : ''}>
          <XpIcon size={14} /> {formatNum((c.xp * 60) / c.growSeconds)}
        </dd>
      </dl>
    </div>
  );
}

const HOLD_MS = 350;

const KIND_LABEL: Record<CropKind, string> = { coin: 'Cày tiền', xp: 'Cày cấp' };

function KindTag({ kind }: { kind: CropKind }) {
  return (
    <span className={`kind-tag ${kind}`}>
      {kind === 'coin' ? <CoinIcon size={13} /> : <XpIcon size={13} />} {KIND_LABEL[kind]}
    </span>
  );
}

type ShopFilter = 'all' | CropKind;
const FILTER_KEY = 'farm-empire:shop-filter';

export function SeedShop({ tile, bulkCount, onPick, onClose }: { tile: number | null; bulkCount: number; onPick: (c: CropId) => void; onClose: () => void }) {
  const s = useGameState();
  const [tip, setTip] = useState<{ id: CropId; rect: DOMRect } | null>(null);
  const [filter, setFilterState] = useState<ShopFilter>(() => {
    try {
      return (localStorage.getItem(FILTER_KEY) as ShopFilter) || 'all';
    } catch {
      return 'all';
    }
  });
  const setFilter = (f: ShopFilter) => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* remembered for this session only */
    }
  };
  const hold = useRef<{ timer: number; x: number; y: number; shown: boolean } | null>(null);
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
  };
  // touch: hold to see details, release hides them (and does not buy); mouse: hover shows them
  const press = (id: CropId) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      cancelHold();
      const el = e.currentTarget;
      hold.current = { x: e.clientX, y: e.clientY, shown: false, timer: window.setTimeout(() => {
        hold.current!.shown = true;
        setTip({ id, rect: el.getBoundingClientRect() });
        navigator.vibrate?.(10);
      }, HOLD_MS) };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const h = hold.current;
      if (h && !h.shown && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) cancelHold();
    },
    onPointerUp: (e: React.PointerEvent) => {
      cancelHold();
      if (e.pointerType !== 'mouse') setTip(null);
    },
    onPointerCancel: () => {
      cancelHold();
      setTip(null);
    },
    onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') setTip({ id, rect: e.currentTarget.getBoundingClientRect() });
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') setTip(null);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  // a long-press ends in a click on touch screens: swallow it so holding never buys
  const buy = (id: CropId, can: boolean) => {
    if (hold.current?.shown) {
      hold.current = null;
      return;
    }
    if (can) onPick(id);
  };
  return (
    <Modal title="Cửa hàng hạt giống" icon={<SeedBagIcon size={34} />} onClose={onClose} wide>
      <p className="panel-sub">
        {bulkCount > 0 ? `Gieo cho ${bulkCount} ô đất trống` : tile !== null ? 'Chọn hạt để gieo vào ô đất này' : 'Chọn hạt rồi chạm vào các ô đất trống'} · Nhấn giữ để xem chi tiết
      </p>
      <div className="segmented shop-tabs">
        {(['all', 'coin', 'xp'] as ShopFilter[]).map((f) => (
          <button key={f} className={`${filter === f ? 'on' : ''} ${f}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tất cả' : f === 'coin' ? (
              <>
                <CoinIcon size={16} /> Cày tiền
              </>
            ) : (
              <>
                <XpIcon size={16} /> Cày cấp
              </>
            )}
          </button>
        ))}
      </div>
      <div className="panel-scroll" onScroll={() => setTip(null)}>
        <div className="seed-grid">
          {CROP_ORDER.filter((id) => filter === 'all' || CROPS[id].kind === filter).map((id) => {
            const c = CROPS[id];
            const locked = c.unlockLevel > s.level;
            const can = !locked && s.coins >= c.seedPrice;
            return (
              <div className={`seed-card ${locked ? 'locked' : ''} ${tip?.id === id ? 'holding' : ''}`} key={id} {...press(id)} onClick={() => buy(id, can)}>
                <div className="seed-art" style={{ background: CROP_BG[id] }}>
                  <CropIcon crop={id} size={52} />
                  <span className={`seed-kind ${c.kind}`} title={KIND_LABEL[c.kind]}>
                    {c.kind === 'coin' ? <CoinIcon size={14} /> : <XpIcon size={14} />}
                  </span>
                  {locked && (
                    <span className="seed-lock-badge">
                      <LockIcon size={14} />
                    </span>
                  )}
                </div>
                <b className="seed-name">{c.name}</b>
                {locked ? (
                  <span className="seed-price locked">Cấp {c.unlockLevel}</span>
                ) : (
                  <span className={`seed-price ${can ? '' : 'poor'}`}>
                    <CoinIcon size={18} /> {formatNum(c.seedPrice)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {tip && <SeedTip id={tip.id} rect={tip.rect} level={s.level} />}
    </Modal>
  );
}

export function Inventory({ onSell, onClose }: { onSell: (c: ItemId, qty: number, from: DOMRect) => void; onClose: () => void }) {
  const s = useGameState();
  const items = ITEM_ORDER.filter((c) => s.inventory[c] > 0);
  const total = items.reduce((sum, c) => sum + s.inventory[c] * itemDef(c).sellPrice, 0);
  return (
    <Modal title="Kho nông sản" icon={<BarnIcon size={34} />} tone="orange" onClose={onClose}>
      {items.length === 0 ? (
        <div className="empty">
          <SproutIcon size={72} />
          <p>Kho đang trống.<br />Thu hoạch cây chín để có nông sản!</p>
        </div>
      ) : (
        <>
          <div className="panel-scroll">
            <div className="inv-list">
              {items.map((c) => (
                <div className="inv-row" key={c}>
                  <div className="inv-art" style={{ background: CROP_BG[c] }}>
                    <ItemIcon item={c} size={44} />
                    <span className="inv-count">×{formatNum(s.inventory[c], 1000)}</span>
                  </div>
                  <div className="inv-info">
                    <b>{itemDef(c).name}</b>
                    <small>
                      <CoinIcon size={14} /> {formatNum(itemDef(c).sellPrice)} / cái
                    </small>
                  </div>
                  <div className="inv-actions">
                    <button className="btn btn-blue small" onClick={(e) => onSell(c, 1, e.currentTarget.getBoundingClientRect())}>
                      Bán 1
                    </button>
                    <button className="btn btn-orange small" onClick={(e) => onSell(c, s.inventory[c], e.currentTarget.getBoundingClientRect())}>
                      Bán hết <CoinIcon size={16} /> {formatNum(s.inventory[c] * itemDef(c).sellPrice)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="inv-total">
            Tổng giá trị: <CoinIcon size={18} /> <b>{formatNum(total)}</b>
          </div>
        </>
      )}
    </Modal>
  );
}

/** A ground tile drawn like in the farm: the tile art seen in the same 2:1 isometric view. */
function TileArt({ kind }: { kind: 'grass' | 'soil' }) {
  const url = artUrl(kind === 'soil' ? 'tiles/soil.png' : 'tiles/grass-1.png');
  return (
    <div className={`unlock-tile ${kind}`}>
      <div className="unlock-tile-face" style={url ? { backgroundImage: `url(${url})` } : undefined} />
    </div>
  );
}

export function UnlockPopup({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const s = useGameState();
  const cost = store.nextUnlockCost();
  const levelOk = store.canUnlockByLevel();
  const can = levelOk && s.coins >= cost;
  return (
    <Modal title="Mở rộng đất" icon={<LockIcon size={32} />} tone="blue" onClose={onClose}>
      <div className="unlock-art">
        <TileArt kind="grass" />
        <span className="unlock-arrow">➜</span>
        <TileArt kind="soil" />
      </div>
      <p className="panel-sub">
        Ô đất thứ {s.unlocked + 1}. Dọn cỏ, làm luống mới để trồng thêm cây.
        <br />
        Mỗi cột có 10 ô; cột mới mở ra bên trái cột cũ.
      </p>
      <div className="row-center">
        <button className="btn btn-ghost" onClick={onClose}>
          Để sau
        </button>
        <button className={`btn ${can ? 'btn-green' : 'btn-disabled'}`} onClick={() => can && onConfirm()}>
          Mở khóa <CoinIcon size={22} /> {formatNum(cost)}
        </button>
      </div>
      {!levelOk ? (
        <p className="warn">
          Cấp {s.level} được sở hữu tối đa {tileCap(s.level)} ô. Lên cấp {store.nextUnlockLevel()} để mở thêm — thu hoạch để nhận XP!
        </p>
      ) : (
        !can && <p className="warn">Cần thêm {formatNum(cost - s.coins)} xu — hãy bán nông sản!</p>
      )}
    </Modal>
  );
}

function LevelGains({ level }: { level: number }) {
  const crops = cropsUnlockedAt(level);
  return (
    <div className="lvl-rewards">
      <div className="lvl-row">
        <CoinIcon size={34} />
        <div>
          +{formatNum(levelReward(level))} xu<small>Phần thưởng lên cấp</small>
        </div>
      </div>
      <div className="lvl-row">
        <SproutIcon size={34} />
        <div>
          Tối đa {tileCap(level)} ô đất<small>+{tileCap(level) - tileCap(level - 1)} ô có thể mở thêm</small>
        </div>
      </div>
      {crops.length > 0 && (
        <div className="lvl-row">
          <div className="lvl-crops">
            {crops.map((c) => (
              <CropIcon key={c} crop={c} size={38} />
            ))}
          </div>
          <div>
            Hạt giống mới: {crops.map((c) => CROPS[c].name).join(', ')}
            <small>Đã có trong cửa hàng hạt giống</small>
          </div>
        </div>
      )}
    </div>
  );
}

export function LevelUpPopup({ level, onClose }: { level: number; onClose: () => void }) {
  return (
    <Modal title="Lên cấp!" icon={<XpIcon size={32} />} tone="blue" onClose={onClose}>
      <div className="lvl-hero">
        <LevelStar level={level} size={110} />
        <b>Cấp {level}</b>
      </div>
      <LevelGains level={level} />
      <div className="row-center">
        <button className="btn btn-green" onClick={onClose}>
          Tuyệt vời!
        </button>
      </div>
    </Modal>
  );
}

/** Roadmap: what the next levels unlock. */
export function LevelsPopup({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const rows = Array.from({ length: 12 }, (_, i) => s.level - 1 + i).filter((l) => l >= 1);
  return (
    <Modal title={`Cấp ${s.level}`} icon={<XpIcon size={32} />} tone="blue" onClose={onClose}>
      <p className="panel-sub">
        Thu hoạch để nhận XP. Còn {formatNum(xpToNext(s.level) - s.xp)} XP nữa lên cấp {s.level + 1}.
      </p>
      <table className="lvl-table">
        <thead>
          <tr>
            <th>Cấp</th>
            <th>Đất tối đa</th>
            <th>Hạt giống mới</th>
            <th>Thưởng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l} className={l < s.level ? 'done' : l === s.level ? 'now' : ''}>
              <td>
                <span className="lvl-num">{l}</span>
              </td>
              <td>{tileCap(l)} ô</td>
              <td>
                {cropsUnlockedAt(l).map((c) => (
                  <span className="crop-chip" key={c}>
                    <CropIcon crop={c} size={24} /> {CROPS[c].name}
                  </span>
                ))}
              </td>
              <td>{l > 1 && <>+{formatNum(levelReward(l))} xu</>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

/** Guest -> register (keeps this farm), or log in to load another farm on this device. */
/** Google's own "Continue with Google" button (rendered by Google Identity Services). */
function GoogleButton({ onCredential, onError }: { onCredential: (credential: string) => void; onError: (message: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderGoogleButton(ref.current, onCredential).catch((e: Error) => onError(e.message));
    // render once per mount; the callbacks only start async work
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="google-btn" ref={ref} />;
}

export function AccountPopup({ onClose, onSwitched }: { onClose: () => void; onSwitched: () => void }) {
  const user = useSyncExternalStore(sync.subscribe, () => sync.user);
  const [tab, setTab] = useState<'register' | 'login'>(user?.isGuest === false ? 'login' : 'register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, switched: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (switched) onSwitched();
    } catch (e) {
      setError(e instanceof ApiError ? e.firstError : 'Không kết nối được máy chủ');
    } finally {
      setBusy(false);
    }
  };
  const registered = user && !user.isGuest;
  const google = (
    <GoogleButton
      onCredential={(c) => void run(() => sync.loginWithGoogle(c), true)}
      onError={(m) => setError(m)}
    />
  );
  return (
    <Modal title="Tài khoản" icon={<SproutIcon size={32} />} tone="blue" onClose={onClose}>
      {registered ? (
        <>
          <div className="account-card">
            {user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <SproutIcon size={44} />}
            <div>
              <b>{user.name}</b>
              <small>{user.email}</small>
              {user.google && <span className="google-chip">Đã liên kết Google</span>}
            </div>
          </div>
          <p className="panel-sub">Nông trại được lưu trên máy chủ. Đăng nhập tài khoản này trên máy khác để chơi tiếp.</p>
          {!user.google && GOOGLE_CLIENT_ID && (
            <>
              <p className="panel-sub">Liên kết Google để lần sau đăng nhập chỉ bằng một chạm:</p>
              {google}
            </>
          )}
          {error && <p className="warn">{error}</p>}
          <div className="row-center">
            <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => sync.logout(), true)}>
              Đăng xuất
            </button>
          </div>
        </>
      ) : (
        <>
          {GOOGLE_CLIENT_ID && (
            <>
              <p className="panel-sub">
                Bạn đang chơi với tư cách khách ({user?.name ?? ''}). Đăng nhập Google để <b>giữ nông trại này</b> và chơi tiếp trên máy khác.
              </p>
              {google}
              <div className="or-line">
                <span>hoặc dùng email</span>
              </div>
            </>
          )}
          <div className="segmented account-tabs">
            <button className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>
              Lưu nông trại
            </button>
            <button className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>
              Đăng nhập
            </button>
          </div>
          <p className="panel-sub">
            {tab === 'register'
              ? GOOGLE_CLIENT_ID
                ? 'Đặt email và mật khẩu để giữ nông trại này.'
                : `Bạn đang chơi với tư cách khách (${user?.name ?? ''}). Đặt email và mật khẩu để giữ nông trại này và chơi trên máy khác.`
              : 'Đăng nhập để tải nông trại đã lưu. Nông trại khách hiện tại sẽ được thay thế trên máy này.'}
          </p>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (tab === 'register') void run(() => sync.register(name, email, password), false);
              else void run(() => sync.login(email, password), true);
            }}
          >
            {tab === 'register' && <input placeholder="Tên nông trại" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            <input type="password" placeholder="Mật khẩu (ít nhất 6 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} minLength={6} required />
            {error && <p className="warn">{error}</p>}
            <button className="btn btn-green" disabled={busy} type="submit">
              {busy ? 'Đang gửi…' : tab === 'register' ? 'Lưu tài khoản' : 'Đăng nhập'}
            </button>
          </form>
        </>
      )}
    </Modal>
  );
}

function ShareIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2f7ae5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3a3a3a" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/** How to add the game to the home screen (iOS has no install API; other browsers use their menu). */
export function InstallPopup({ onClose }: { onClose: () => void }) {
  const steps = pwa.ios
    ? [
        <>Mở trang này bằng <b>Safari</b></>,
        <>
          Bấm nút <b>Chia sẻ</b> <ShareIcon /> ở thanh dưới (iPad: góc trên)
        </>,
        <>
          Chọn <b>Thêm vào MH chính</b> <AddIcon />
        </>,
        <>Bấm <b>Thêm</b>, rồi mở game từ biểu tượng Nông Trại</>,
      ]
    : [
        <>Mở trang này bằng <b>Chrome</b></>,
        <>Bấm nút menu <b>⋮</b> ở góc trên bên phải</>,
        <>
          Chọn <b>Cài đặt ứng dụng</b> hoặc <b>Thêm vào màn hình chính</b>
        </>,
        <>Mở game từ biểu tượng Nông Trại trên màn hình chính</>,
      ];
  return (
    <Modal title="Cài như ứng dụng" icon={<SproutIcon size={32} />} tone="green" onClose={onClose}>
      <p className="panel-sub">Mở từ màn hình chính, game chạy toàn màn hình như một ứng dụng thật — không còn thanh địa chỉ của trình duyệt.</p>
      <ol className="install-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="step">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="row-center">
        <button className="btn btn-green" onClick={onClose}>
          Đã hiểu
        </button>
      </div>
    </Modal>
  );
}

export function Settings({
  quality,
  onQuality,
  sound,
  onSound,
  music,
  onMusic,
  fps,
  onFps,
  onAccount,
  onInstall,
  onClose,
}: {
  quality: Quality;
  onQuality: (q: Quality) => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  music: boolean;
  onMusic: (on: boolean) => void;
  fps: boolean;
  onFps: (on: boolean) => void;
  onAccount: () => void;
  onInstall: () => void;
  onClose: () => void;
}) {
  useSyncExternalStore(sync.subscribe, () => sync.user);
  useSyncExternalStore(pwa.subscribe, () => pwa.canPrompt);
  return (
    <Modal title="Cài đặt" icon={<GearIcon size={32} />} tone="blue" onClose={onClose}>
      <div className="set-row">
        <span>Chất lượng đồ họa</span>
        <div className="segmented">
          {(['low', 'medium', 'high'] as Quality[]).map((q) => (
            <button key={q} className={q === quality ? 'on' : ''} onClick={() => onQuality(q)}>
              {q === 'low' ? 'Thấp' : q === 'medium' ? 'Vừa' : 'Cao'}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <span>Âm thanh</span>
        <button className={`toggle ${sound ? 'on' : ''}`} onClick={() => onSound(!sound)}>
          <SoundIcon on={sound} size={26} /> {sound ? 'Bật' : 'Tắt'}
        </button>
      </div>
      <div className="set-row">
        <span>Nhạc nền</span>
        <button className={`toggle ${music ? 'on' : ''}`} onClick={() => onMusic(!music)}>
          <MusicIcon on={music} size={26} /> {music ? 'Bật' : 'Tắt'}
        </button>
      </div>
      <div className="set-row">
        <span>Hiện FPS</span>
        <button className={`toggle ${fps ? 'on' : ''}`} onClick={() => onFps(!fps)}>
          {fps ? 'Bật' : 'Tắt'}
        </button>
      </div>
      <div className="set-row">
        <span>Ứng dụng</span>
        {pwa.installed ? (
          <span className="muted">Đã cài trên máy</span>
        ) : (
          <button className="btn btn-green small" onClick={onInstall}>
            Cài lên màn hình chính
          </button>
        )}
      </div>
      <div className="set-row">
        <span>Tài khoản</span>
        {sync.status === 'offline' ? (
          // offline sessions never reached the API: a reload retries the connection
          <button className="btn btn-orange small" onClick={() => location.reload()}>
            Mất kết nối · Kết nối lại
          </button>
        ) : (
          <button className="btn btn-blue small" onClick={onAccount}>
            {sync.user?.isGuest === false ? sync.user.name : 'Khách · Lưu tài khoản'}
          </button>
        )}
      </div>
    </Modal>
  );
}
