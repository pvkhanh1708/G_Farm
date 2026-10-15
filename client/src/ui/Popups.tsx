import { useEffect, useState } from 'react';
import { CROP_ORDER, CROPS, CropId, cropsUnlockedAt, levelReward, Quality, tileCap, xpToNext } from '../game/config';
import { store } from '../game/state/store';
import { assetSummary } from '../game/assets/registry';
import { useGameState } from './Hud';
import { ClockIcon, CloseIcon, CoinIcon, CropIcon, LockIcon, SoundIcon, SproutIcon, BarnIcon, SeedBagIcon, GearIcon, LevelStar, XpIcon } from './icons';

function Modal({ title, icon, tone = 'green', onClose, children, wide }: { title: string; icon: React.ReactNode; tone?: 'green' | 'orange' | 'blue'; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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

const CROP_BG: Record<CropId, string> = {
  carrot: '#ffe2c2', wheat: '#fff1b8', tomato: '#ffd6cf', strawberry: '#ffd9e0', cabbage: '#dcf5cf',
  corn: '#fff3b0', eggplant: '#ecdcff', pumpkin: '#ffe0c0', sunflower: '#fff6c2',
  potato: '#f3e2c8', chili: '#ffd8d0', watermelon: '#d8f5d0', pineapple: '#fff0b8', cotton: '#eef0f4', lavender: '#e8dcff',
};

export function SeedShop({ tile, bulkCount, onPick, onClose }: { tile: number | null; bulkCount: number; onPick: (c: CropId) => void; onClose: () => void }) {
  const s = useGameState();
  return (
    <Modal title="Cửa hàng hạt giống" icon={<SeedBagIcon size={34} />} onClose={onClose} wide>
      <p className="panel-sub">{bulkCount > 0 ? `Trồng tất cả: gieo cho ${bulkCount} ô đất trống (theo số xu bạn có)` : tile !== null ? 'Chọn hạt để gieo vào ô đất này' : 'Chọn hạt rồi chạm vào các ô đất trống để gieo'}</p>
      <div className="seed-grid">
        {CROP_ORDER.map((id) => {
          const c = CROPS[id];
          const locked = c.unlockLevel > s.level;
          const can = !locked && s.coins >= c.seedPrice;
          return (
            <div className={`seed-card ${locked ? 'locked' : ''}`} key={id}>
              <div className="seed-art" style={{ background: CROP_BG[id] }}>
                <CropIcon crop={id} size={64} />
              </div>
              <b className="seed-name">{c.name}</b>
              <div className="seed-stats">
                <span>
                  <ClockIcon size={16} /> {c.growSeconds}s
                </span>
                <span>
                  Thu ×{c.yield}
                </span>
                <span className="seed-xp">
                  <XpIcon size={14} /> {c.xp}
                </span>
              </div>
              <div className="seed-sell">
                Bán <CoinIcon size={14} /> {c.sellPrice}/cái
              </div>
              {locked ? (
                <button className="btn btn-disabled seed-lock" disabled>
                  <LockIcon size={18} /> Cấp {c.unlockLevel}
                </button>
              ) : (
                <button className={`btn ${can ? 'btn-green' : 'btn-disabled'}`} onClick={() => can && onPick(id)}>
                  <CoinIcon size={22} /> {c.seedPrice}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function Inventory({ onSell, onClose }: { onSell: (c: CropId, qty: number, from: DOMRect) => void; onClose: () => void }) {
  const s = useGameState();
  const items = CROP_ORDER.filter((c) => s.inventory[c] > 0);
  const total = items.reduce((sum, c) => sum + s.inventory[c] * CROPS[c].sellPrice, 0);
  return (
    <Modal title="Kho nông sản" icon={<BarnIcon size={34} />} tone="orange" onClose={onClose}>
      {items.length === 0 ? (
        <div className="empty">
          <SproutIcon size={72} />
          <p>Kho đang trống.<br />Thu hoạch cây chín để có nông sản!</p>
        </div>
      ) : (
        <>
          <div className="inv-list">
            {items.map((c) => (
              <div className="inv-row" key={c}>
                <div className="inv-art" style={{ background: CROP_BG[c] }}>
                  <CropIcon crop={c} size={44} />
                  <span className="inv-count">×{s.inventory[c]}</span>
                </div>
                <div className="inv-info">
                  <b>{CROPS[c].name}</b>
                  <small>
                    <CoinIcon size={14} /> {CROPS[c].sellPrice} / cái
                  </small>
                </div>
                <div className="inv-actions">
                  <button className="btn btn-blue small" onClick={(e) => onSell(c, 1, e.currentTarget.getBoundingClientRect())}>
                    Bán 1
                  </button>
                  <button className="btn btn-orange small" onClick={(e) => onSell(c, s.inventory[c], e.currentTarget.getBoundingClientRect())}>
                    Bán hết <CoinIcon size={16} /> {s.inventory[c] * CROPS[c].sellPrice}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="inv-total">
            Tổng giá trị: <CoinIcon size={18} /> <b>{total}</b>
          </div>
        </>
      )}
    </Modal>
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
        <div className="unlock-tile grass" />
        <span className="unlock-arrow">➜</span>
        <div className="unlock-tile soil" />
      </div>
      <p className="panel-sub">
        Ô đất thứ {s.unlocked + 1}. Dọn cỏ, làm luống mới để trồng thêm cây.
        <br />
        Mở hết 16 ô của một mảnh thì mảnh đất kế tiếp sẽ xuất hiện.
      </p>
      <div className="row-center">
        <button className="btn btn-ghost" onClick={onClose}>
          Để sau
        </button>
        <button className={`btn ${can ? 'btn-green' : 'btn-disabled'}`} onClick={() => can && onConfirm()}>
          Mở khóa <CoinIcon size={22} /> {cost}
        </button>
      </div>
      {!levelOk ? (
        <p className="warn">
          Cấp {s.level} được sở hữu tối đa {tileCap(s.level)} ô. Lên cấp {store.nextUnlockLevel()} để mở thêm — thu hoạch để nhận XP!
        </p>
      ) : (
        !can && <p className="warn">Cần thêm {cost - s.coins} xu — hãy bán nông sản!</p>
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
          +{levelReward(level)} xu<small>Phần thưởng lên cấp</small>
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
        Thu hoạch để nhận XP. Còn {(xpToNext(s.level) - s.xp).toLocaleString('vi-VN')} XP nữa lên cấp {s.level + 1}.
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
              <td>{l > 1 && <>+{levelReward(l)} xu</>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function Settings({
  quality,
  onQuality,
  sound,
  onSound,
  fps,
  onFps,
  onReset,
  onClose,
}: {
  quality: Quality;
  onQuality: (q: Quality) => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  fps: boolean;
  onFps: (on: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const a = assetSummary();
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
        <span>Hiện FPS</span>
        <button className={`toggle ${fps ? 'on' : ''}`} onClick={() => onFps(!fps)}>
          {fps ? 'Bật' : 'Tắt'}
        </button>
      </div>
      <div className="set-row">
        <span>Tiến trình</span>
        {confirm ? (
          <button className="btn btn-red small" onClick={onReset}>
            Xác nhận chơi lại
          </button>
        ) : (
          <button className="btn btn-ghost small" onClick={() => setConfirm(true)}>
            Chơi lại từ đầu
          </button>
        )}
      </div>
      <div className="asset-note">
        <b>Bản Vertical Slice</b> — đồ họa đang dùng mô hình thủ tục tạm thời ({a.placeholder}/{a.total} asset là placeholder). Xem ASSETS.md.
      </div>
    </Modal>
  );
}
