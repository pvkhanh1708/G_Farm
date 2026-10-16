import { useEffect, useState } from 'react';
import { ANIMAL_ORDER, ANIMALS, CROPS, ECONOMY, ItemId, NEIGHBORS, itemDef, LOGIN_REWARDS, ORDERS_UNLOCK, UPGRADES, upgradeCost, UpgradeKind } from '../game/config';
import { sfx } from '../game/audio/sfx';
import { serverNow } from '../game/net/clock';
import { Board, BoardRow, farmApi, FarmError, leaderboard } from '../game/net/farm';
import { sync } from '../game/net/sync';
import type { Animal, Order } from '../game/state/store';
import { bump, fxBus } from './FxLayer';
import { useGameState } from './Hud';
import { AnimalIcon, CoinIcon, DogIcon, FertilizerIcon, GiftIcon, ItemIcon, LockIcon, OrderIcon, QuestIcon, RainIcon, TrophyIcon, UpgradeIcon, XpIcon } from './icons';
import { CROP_BG, Modal } from './Popups';
import { formatNum } from './format';

/** Run a server call; errors become a toast. Returns the result or null. */
export async function run<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    sfx.error();
    fxBus.toast(e instanceof FarmError ? e.message : 'Có lỗi xảy ra', 'bad');
    return null;
  }
}

/** Coins flying from a button to the coin bar, plus level-up toasts. */
export function reward(from: DOMRect | null, coins: number, xp: number, levelUps: number[] = []) {
  sfx.coin();
  if (from) {
    const o = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    if (coins) fxBus.fly({ type: 'coin' }, o, 'coins', 6, () => (sfx.coinTick(), bump('coins')));
    if (xp) fxBus.fly({ type: 'xp' }, o, 'level', 3, () => bump('level'));
  }
  const parts = [coins ? `+${formatNum(coins)} xu` : '', xp ? `+${formatNum(xp)} XP` : ''].filter(Boolean);
  fxBus.toast(parts.join(' · '), 'good');
  if (levelUps.length) {
    sfx.unlock();
    fxBus.toast(`Lên cấp ${levelUps[levelUps.length - 1]}!`, 'good');
  }
}

export function Locked({ level, what }: { level: number; what: string }) {
  return (
    <div className="empty">
      <LockIcon size={64} />
      <p>
        {what} mở ở cấp {level}.
      </p>
    </div>
  );
}

export function Busy({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <>{on ? '…' : children}</>;
}

// ---------------------------------------------------------------- upgrades

const UPGRADE_TEXT: Record<UpgradeKind, (lvl: number) => string> = {
  soil: (l) => `+${Math.round(UPGRADES.soil.yieldPerLevel! * l * 100)}% sản lượng`,
  sprinkler: (l) => `-${Math.round(UPGRADES.sprinkler.speedPerLevel! * l * 100)}% thời gian lớn`,
};

export function UpgradesPopup({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const [busy, setBusy] = useState<UpgradeKind | null>(null);
  return (
    <Modal title="Nâng cấp" icon={<UpgradeIcon size={34} />} tone="green" onClose={onClose}>
      <div className="prog-list">
        {(['soil', 'sprinkler'] as UpgradeKind[]).map((k) => {
          const u = UPGRADES[k];
          const lvl = k === 'soil' ? s.soil : s.sprinkler;
          const max = lvl >= u.max;
          const cost = upgradeCost(k, lvl);
          const locked = s.level < u.unlockLevel;
          return (
            <div className="prog-row" key={k}>
              <div className="prog-art">{k === 'soil' ? <FertilizerIcon size={44} /> : <RainIcon size={44} />}</div>
              <div className="prog-info">
                <b>
                  {u.name} <span className="pill">{lvl}/{u.max}</span>
                </b>
                <small>{lvl ? UPGRADE_TEXT[k](lvl) : k === 'soil' ? 'Thu được nhiều nông sản hơn' : 'Cây lớn nhanh hơn'}</small>
                {!max && !locked && <small className="next">Cấp sau: {UPGRADE_TEXT[k](lvl + 1)}</small>}
              </div>
              {locked ? (
                <span className="muted">Cấp {u.unlockLevel}</span>
              ) : max ? (
                <span className="muted">Tối đa</span>
              ) : (
                <button
                  className="btn btn-orange small"
                  disabled={!!busy || s.coins < cost}
                  onClick={async (e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setBusy(k);
                    const res = await run(() => farmApi.upgrade(k));
                    setBusy(null);
                    if (res) {
                      sfx.unlock();
                      fxBus.toast(`${u.name} lên cấp ${res.level}!`, 'good');
                      fxBus.float(r.left + r.width / 2, r.top, `-${formatNum(cost)}`, { type: 'coin' });
                    }
                  }}
                >
                  <Busy on={busy === k}>
                    <CoinIcon size={16} /> {formatNum(cost)}
                  </Busy>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="prog-note">
        <FertilizerIcon size={18} /> Phân bón: chạm vào cây đang lớn rồi bấm “Bón phân” để cây lớn nhanh gấp đôi.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------- orders

function OrderCard({ o, inv }: { o: Order; inv: Record<ItemId, number> }) {
  const [busy, setBusy] = useState(false);
  const items = Object.entries(o.items) as Array<[ItemId, number]>;
  const ready = items.every(([id, n]) => (inv[id] ?? 0) >= n);
  return (
    <div className={`order ${ready ? 'ready' : ''}`}>
      <div className="order-items">
        {items.map(([id, n]) => (
          <div className="order-item" key={id} style={{ background: CROP_BG[id] }} title={itemDef(id).name}>
            <ItemIcon item={id} size={38} />
            <span className={(inv[id] ?? 0) >= n ? 'ok' : 'short'}>
              {formatNum(Math.min(inv[id] ?? 0, n))}/{formatNum(n)}
            </span>
          </div>
        ))}
      </div>
      <div className="order-foot">
        <span className="order-reward">
          <CoinIcon size={18} /> {formatNum(o.coins)} <XpIcon size={18} /> {formatNum(o.xp)}
        </span>
        <button
          className="btn btn-ghost small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await run(() => farmApi.skip(o.id)) !== null) sfx.tap();
            setBusy(false);
          }}
        >
          Đổi
        </button>
        <button
          className="btn btn-green small"
          disabled={busy || !ready}
          onClick={async (e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setBusy(true);
            const res = await run(() => farmApi.deliver(o.id));
            setBusy(false);
            if (res) reward(r, res.coins, res.xp, res.levelUps);
          }}
        >
          <Busy on={busy}>Giao hàng</Busy>
        </button>
      </div>
    </div>
  );
}

export function OrdersPopup({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  return (
    <Modal title="Đơn hàng" icon={<OrderIcon size={34} />} tone="orange" onClose={onClose}>
      {s.level < ORDERS_UNLOCK ? (
        <Locked level={ORDERS_UNLOCK} what="Bảng đơn hàng" />
      ) : !s.orders.length ? (
        <div className="empty">
          <p>Đang tải đơn hàng…</p>
        </div>
      ) : (
        <div className="panel-scroll">
          <p className="prog-note">Giao đủ hàng để nhận nhiều xu hơn bán ở chợ. Không thích đơn nào thì bấm “Đổi”.</p>
          {s.orders.map((o) => (
            <OrderCard key={o.id} o={o} inv={s.inventory} />
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- daily quests + login

export function loginRewardFor(streak: number, level: number) {
  return Math.round(LOGIN_REWARDS[(streak - 1) % LOGIN_REWARDS.length] * (1 + level * 0.2));
}

function LoginStrip() {
  const s = useGameState();
  const [busy, setBusy] = useState(false);
  const d = s.daily;
  if (!d) return null;
  const yesterday = new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);
  // the day the next claim lands on (continuing the streak or starting over)
  const next = d.loginClaimed ? d.streak : d.lastLogin === yesterday ? (d.streak % LOGIN_REWARDS.length) + 1 : 1;
  return (
    <div className="login-strip">
      <div className="login-days">
        {LOGIN_REWARDS.map((_, i) => {
          const day = i + 1;
          const done = day < next || (d.loginClaimed && day === next);
          return (
            <div key={day} className={`login-day ${done ? 'done' : ''} ${day === next && !d.loginClaimed ? 'today' : ''}`}>
              <small>Ngày {day}</small>
              {day === 7 ? <GiftIcon size={28} /> : <CoinIcon size={24} />}
              <b>{formatNum(loginRewardFor(day, s.level), 10000)}</b>
            </div>
          );
        })}
      </div>
      <button
        className="btn btn-orange"
        disabled={busy || d.loginClaimed}
        onClick={async (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setBusy(true);
          const res = await run(() => farmApi.claimLogin());
          setBusy(false);
          if (res) reward(r, res.coins, 0);
        }}
      >
        <Busy on={busy}>{d.loginClaimed ? 'Mai quay lại nhé!' : 'Nhận quà hôm nay'}</Busy>
      </button>
    </div>
  );
}

export function QuestsPopup({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <Modal title="Nhiệm vụ ngày" icon={<QuestIcon size={34} />} tone="blue" onClose={onClose}>
      {!s.daily ? (
        <div className="empty">
          <p>{sync.status === 'offline' ? 'Cần kết nối máy chủ.' : 'Đang tải…'}</p>
        </div>
      ) : (
        <div className="panel-scroll">
          <LoginStrip />
          <div className="prog-list">
            {s.daily.quests.map((q, i) => {
              const done = q.progress >= q.target;
              return (
                <div className={`prog-row quest ${q.claimed ? 'claimed' : ''}`} key={i}>
                  <div className="prog-info">
                    <b>{q.name}</b>
                    <div className="quest-bar">
                      <div style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} />
                      <span>
                        {formatNum(q.progress)}/{formatNum(q.target)}
                      </span>
                    </div>
                    <small>
                      <CoinIcon size={14} /> {formatNum(q.coins)} · <XpIcon size={14} /> {formatNum(q.xp)}
                    </small>
                  </div>
                  {q.claimed ? (
                    <span className="muted">Đã nhận</span>
                  ) : (
                    <button
                      className="btn btn-green small"
                      disabled={!done || busy !== null}
                      onClick={async (e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setBusy(i);
                        const res = await run(() => farmApi.claimQuest(i));
                        setBusy(null);
                        if (res) reward(r, res.coins, res.xp, res.levelUps);
                      }}
                    >
                      <Busy on={busy === i}>Nhận</Busy>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="prog-note">Nhiệm vụ mới mỗi ngày lúc 0 giờ.</p>
        </div>
      )}
    </Modal>
  );
}

/** Quests ready to claim plus today's login gift: the badge on the quest button. */
export function claimableCount(daily: ReturnType<typeof useGameState>['daily']) {
  if (!daily) return 0;
  return daily.quests.filter((q) => !q.claimed && q.progress >= q.target).length + (daily.loginClaimed ? 0 : 1);
}

export function LoginRewardPopup({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  useEffect(() => {
    if (s.daily?.loginClaimed) {
      const t = setTimeout(onClose, 1400);
      return () => clearTimeout(t);
    }
  }, [s.daily?.loginClaimed, onClose]);
  return (
    <Modal title="Quà đăng nhập" icon={<GiftIcon size={34} />} tone="orange" onClose={onClose}>
      <p className="prog-note">Vào game mỗi ngày liên tiếp để nhận quà lớn hơn. Lỡ một ngày sẽ tính lại từ đầu.</p>
      <LoginStrip />
    </Modal>
  );
}

// ---------------------------------------------------------------- animals

export function animalReady(a: Animal, now = serverNow()) {
  return a.fedAt !== null && now >= a.fedAt + ANIMALS[a.type].period * 1000;
}

/** Milliseconds of water left in a pen (0 = dry). */
export function waterLeft(filledAt: number | undefined, now = serverNow()) {
  return Math.max(0, (filledAt ?? 0) + ECONOMY.water.minutes * 60_000 - now);
}

export function animalHungry(a: Animal) {
  return a.fedAt === null;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function mmss(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s} giây`;
}

const minutes = (sec: number) => (sec % 60 ? mmss(sec) : `${sec / 60} phút`);

export function AnimalsPopup({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const ready = s.animals.filter((a) => animalReady(a, now)).length;
  const hungry = s.animals.filter(animalHungry).length;
  const dog = NEIGHBORS.dog;
  return (
    <Modal title="Chuồng trại" icon={<AnimalIcon type="chicken" size={34} />} tone="orange" onClose={onClose}>
      <div className="panel-scroll">
        <div className="prog-list">
          {ANIMAL_ORDER.map((id) => {
            const a = ANIMALS[id];
            const mine = s.animals.filter((x) => x.type === id);
            const locked = s.level < a.unlockLevel;
            const nHungry = mine.filter(animalHungry).length;
            const nReady = mine.filter((x) => animalReady(x, now)).length;
            const growing = mine.filter((x) => x.fedAt !== null && !animalReady(x, now)).map((x) => x.fedAt! + a.period * 1000);
            return (
              <div className="prog-row" key={id}>
                <div className="prog-art">
                  <AnimalIcon type={id} size={46} />
                </div>
                <div className="prog-info">
                  <b>
                    {a.name} <span className="pill">{mine.length}/{a.max}</span>
                  </b>
                  <small>
                    Ăn <ItemIcon item={a.feed.crop} size={16} /> {a.feed.qty} {CROPS[a.feed.crop].name.toLowerCase()} → <ItemIcon item={a.product} size={16} /> 1 {a.productName.toLowerCase()} sau {minutes(a.period)}
                  </small>
                  <small>
                    Bán <CoinIcon size={14} /> {formatNum(a.sellPrice)} · trong kho có {formatNum(s.inventory[a.feed.crop])} {CROPS[a.feed.crop].name.toLowerCase()}
                  </small>
                  {mine.length > 0 && (
                    <small className={waterLeft(s.water[id], now) > 0 ? '' : 'short'}>
                      {waterLeft(s.water[id], now) > 0 ? `Nước còn ${mmss(Math.ceil(waterLeft(s.water[id], now) / 1000))}` : 'Máng nước cạn!'}{' '}
                      <button
                        className="link-btn"
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy(`water-${id}`);
                          const res = await run(() => farmApi.water(id));
                          setBusy(null);
                          if (res !== null) sfx.plant();
                        }}
                      >
                        Đổ nước
                      </button>
                    </small>
                  )}
                  {mine.length > 0 && (
                    <small className="next">
                      {[nReady && `${nReady} con có sản phẩm`, nHungry && `${nHungry} con đang đói`, growing.length && `lần thu tới ${mmss(Math.max(0, Math.ceil((Math.min(...growing) - now) / 1000)))}`].filter(Boolean).join(' · ')}
                    </small>
                  )}
                </div>
                {locked ? (
                  <span className="muted">Cấp {a.unlockLevel}</span>
                ) : mine.length >= a.max ? (
                  <span className="muted">Đầy chuồng</span>
                ) : (
                  <button
                    className="btn btn-orange small"
                    disabled={!!busy || s.coins < a.price}
                    onClick={async () => {
                      setBusy(id);
                      const res = await run(() => farmApi.buyAnimal(id));
                      setBusy(null);
                      if (res) {
                        sfx.unlock();
                        fxBus.toast(`Đã mua ${a.name.toLowerCase()}!`, 'good');
                      }
                    }}
                  >
                    <Busy on={busy === id}>
                      Mua <CoinIcon size={16} /> {formatNum(a.price)}
                    </Busy>
                  </button>
                )}
              </div>
            );
          })}
          <div className="prog-row">
            <div className="prog-art">
              <DogIcon size={46} />
            </div>
            <div className="prog-info">
              <b>{dog.name}</b>
              <small>Bắt quả tang {Math.round(dog.catchChance * 100)}% kẻ hái trộm; kẻ trộm bị phạt xu, tiền phạt vào túi bạn.</small>
            </div>
            {s.dog ? (
              <span className="muted">Đã có</span>
            ) : s.level < dog.unlockLevel ? (
              <span className="muted">Cấp {dog.unlockLevel}</span>
            ) : (
              <button
                className="btn btn-orange small"
                disabled={!!busy || s.coins < dog.price}
                onClick={async () => {
                  setBusy('dog');
                  const res = await run(() => farmApi.buyDog());
                  setBusy(null);
                  if (res !== null) {
                    sfx.unlock();
                    fxBus.toast('Đã có chó canh nông trại!', 'good');
                  }
                }}
              >
                <Busy on={busy === 'dog'}>
                  Mua <CoinIcon size={16} /> {formatNum(dog.price)}
                </Busy>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="row-actions">
        <button
          className="btn btn-orange"
          disabled={!hungry || !!busy}
          onClick={async () => {
            setBusy('feed');
            const res = await run(() => farmApi.feed());
            setBusy(null);
            if (res) {
              sfx.plant();
              fxBus.toast(`Đã cho ${res.fed} con ăn`, 'good');
            }
          }}
        >
          <Busy on={busy === 'feed'}>{hungry ? `Cho ăn (${hungry})` : 'Không con nào đói'}</Busy>
        </button>
        <button
          className="btn btn-green"
          disabled={!ready || !!busy}
          onClick={async (e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setBusy('collect');
            const res = await run(() => farmApi.collect());
            setBusy(null);
            if (res) {
              sfx.collect();
              fxBus.fly({ type: 'xp' }, { x: r.left + r.width / 2, y: r.top }, 'level', 2, () => bump('level'));
              fxBus.toast(`Đã thu ${res.collected} sản phẩm · +${res.xp} XP`, 'good');
            }
          }}
        >
          <Busy on={busy === 'collect'}>{ready ? `Thu (${ready})` : 'Chưa có sản phẩm'}</Busy>
        </button>
      </div>
      <p className="prog-note">Con vật cần máng nước còn đầy và được cho ăn mới đẻ trứng, cho sữa. Trong chuồng: chạm máng nước để đổ nước, chạm máng ăn hoặc con đói để cho ăn, chạm trứng / bình sữa để thu.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- leaderboard

const BOARDS: Record<'farm' | 'game', Array<{ id: Board; label: string; unit: (v: number) => string }>> = {
  farm: [
    { id: 'coins', label: 'Xu', unit: (v) => `${formatNum(v)} xu` },
    { id: 'level', label: 'Cấp', unit: (v) => `Cấp ${v}` },
    { id: 'tiles', label: 'Ô đất', unit: (v) => `${formatNum(v)} ô` },
  ],
  game: [
    { id: 'wins', label: 'Trận thắng', unit: (v) => `${formatNum(v)} trận` },
    { id: 'winnings', label: 'Tiền thắng', unit: (v) => `${formatNum(v)} xu` },
  ],
};

export function LeaderboardPopup({ onClose, onVisit }: { onClose: () => void; onVisit: (id: number) => void }) {
  const [group, setGroup] = useState<'farm' | 'game'>('farm');
  const [board, setBoard] = useState<Board>('coins');
  const [data, setData] = useState<{ rows: BoardRow[]; me: { rank: number; value: number } | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    if (sync.status === 'offline') return setErr('Cần kết nối máy chủ');
    leaderboard(board)
      .then((d) => live && setData(d))
      .catch(() => live && setErr('Không tải được bảng xếp hạng'));
    return () => void (live = false);
  }, [board]);
  const def = BOARDS[group].find((b) => b.id === board) ?? BOARDS[group][0];
  const me = sync.user?.id;
  return (
    <Modal title="Bảng xếp hạng" icon={<TrophyIcon size={34} />} tone="blue" onClose={onClose} wide>
      <div className="segmented lb-tabs">
        {(['farm', 'game'] as const).map((g) => (
          <button
            key={g}
            className={g === group ? 'on' : ''}
            onClick={() => {
              sfx.tap();
              setGroup(g);
              setBoard(BOARDS[g][0].id);
            }}
          >
            {g === 'farm' ? 'Nông trại' : 'Phòng game'}
          </button>
        ))}
      </div>
      <div className="lb-sub">
        {BOARDS[group].map((b) => (
          <button key={b.id} className={`chip ${b.id === board ? 'on' : ''}`} onClick={() => (sfx.tap(), setBoard(b.id))}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="panel-scroll lb-list">
        {err ? (
          <p className="muted center">{err}</p>
        ) : !data ? (
          <p className="muted center">Đang tải…</p>
        ) : !data.rows.length ? (
          <p className="muted center">Chưa có ai trên bảng này.</p>
        ) : (
          data.rows.map((r) => (
            <div
              key={r.id}
              className={`lb-row ${r.id === me ? 'me' : 'visitable'} ${r.rank <= 3 ? `top${r.rank}` : ''}`}
              onClick={() => r.id !== me && onVisit(r.id)}
              title={r.id === me ? undefined : 'Thăm nông trại'}
            >
              <span className="lb-rank">{r.rank}</span>
              {r.avatar ? <img className="lb-avatar" src={r.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="lb-avatar">{r.name.slice(0, 1).toUpperCase()}</span>}
              <span className="lb-name">
                {r.name}
                <small>Cấp {r.level}</small>
              </span>
              <b className="lb-value">{def.unit(r.value)}</b>
            </div>
          ))
        )}
      </div>
      {data?.me && (
        <div className="lb-row me lb-mine">
          <span className="lb-rank">{data.me.rank > 999 ? '999+' : data.me.rank}</span>
          <span className="lb-name">Bạn</span>
          <b className="lb-value">{def.unit(data.me.value)}</b>
        </div>
      )}
    </Modal>
  );
}

