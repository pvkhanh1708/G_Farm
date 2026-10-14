import { useEffect, useState } from 'react';
import { CROP_ORDER, CROPS, CropId, Quality } from '../game/config';
import { store } from '../game/state/store';
import { assetSummary } from '../game/assets/registry';
import { useGameState } from './Hud';
import { ClockIcon, CloseIcon, CoinIcon, CropIcon, LockIcon, SoundIcon, SproutIcon, BarnIcon, SeedBagIcon, GearIcon } from './icons';

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

const CROP_BG: Record<CropId, string> = { carrot: '#ffe2c2', wheat: '#fff1b8', tomato: '#ffd6cf' };

export function SeedShop({ tile, bulkCount, onPick, onClose }: { tile: number | null; bulkCount: number; onPick: (c: CropId) => void; onClose: () => void }) {
  const s = useGameState();
  return (
    <Modal title="Cửa hàng hạt giống" icon={<SeedBagIcon size={34} />} onClose={onClose} wide>
      <p className="panel-sub">{bulkCount > 0 ? `Trồng tất cả: gieo cho ${bulkCount} ô đất trống (theo số xu bạn có)` : tile !== null ? 'Chọn hạt để gieo vào ô đất này' : 'Chọn hạt rồi chạm vào các ô đất trống để gieo'}</p>
      <div className="seed-grid">
        {CROP_ORDER.map((id) => {
          const c = CROPS[id];
          const can = s.coins >= c.seedPrice;
          return (
            <div className="seed-card" key={id}>
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
              </div>
              <div className="seed-sell">
                Bán <CoinIcon size={14} /> {c.sellPrice}/cái
              </div>
              <button className={`btn ${can ? 'btn-green' : 'btn-disabled'}`} onClick={() => can && onPick(id)}>
                <CoinIcon size={22} /> {c.seedPrice}
              </button>
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
  const can = s.coins >= cost;
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
      {!can && <p className="warn">Cần thêm {cost - s.coins} xu — hãy bán nông sản!</p>}
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
