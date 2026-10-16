import { sfx } from '../game/audio/sfx';
import { AnimalIcon, CardsIcon, NeighborIcon, OrderIcon, QuestIcon, TrophyIcon, UpgradeIcon, WorkshopIcon } from './icons';
import { Modal } from './Popups';

export type MenuTarget = 'room' | 'quests' | 'orders' | 'animals' | 'workshop' | 'neighbors' | 'upgrades' | 'ranks';

/**
 * Right edge, under the coin bar: only what is used all the time (quests, orders) plus "Thêm".
 * The workshop, pens and upgrades are also buildings in the farm scene.
 */
export function SideButtons({ quests, orders, more, onOpen, onMore }: { quests: number; orders: number; more: number; onOpen: (t: MenuTarget) => void; onMore: () => void }) {
  const items: Array<{ label: string; icon: React.ReactNode; badge?: number; go: () => void }> = [
    { label: 'Nhiệm vụ', icon: <QuestIcon size={30} />, badge: quests, go: () => onOpen('quests') },
    { label: 'Đơn hàng', icon: <OrderIcon size={30} />, badge: orders, go: () => onOpen('orders') },
    { label: 'Thêm', icon: <span className="more-dots">•••</span>, badge: more, go: onMore },
  ];
  return (
    <div className="side-col">
      {items.map((it) => (
        <button key={it.label} className="round-btn small side-btn" onClick={it.go} aria-label={it.label}>
          {it.icon}
          <span className="round-btn-label">{it.label}</span>
          {!!it.badge && <span className="count-badge">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Everything else, in one grid. */
export function MoreMenu({ badges, onOpen, onClose }: { badges: Partial<Record<MenuTarget, number>>; onOpen: (t: MenuTarget) => void; onClose: () => void }) {
  const items: Array<{ t: MenuTarget; label: string; icon: React.ReactNode }> = [
    { t: 'neighbors', label: 'Hàng xóm', icon: <NeighborIcon size={52} /> },
    { t: 'animals', label: 'Chuồng trại', icon: <AnimalIcon type="chicken" size={52} /> },
    { t: 'workshop', label: 'Xưởng', icon: <WorkshopIcon size={52} /> },
    { t: 'upgrades', label: 'Nâng cấp', icon: <UpgradeIcon size={52} /> },
    { t: 'ranks', label: 'Xếp hạng', icon: <TrophyIcon size={52} /> },
    { t: 'room', label: 'Phòng game', icon: <CardsIcon size={52} /> },
  ];
  return (
    <Modal title="Thêm" icon={<span className="more-dots">•••</span>} tone="blue" onClose={onClose}>
      <div className="more-grid">
        {items.map((it) => (
          <button key={it.t} className="more-item" onClick={() => (sfx.open(), onOpen(it.t))}>
            {it.icon}
            <b>{it.label}</b>
            {!!badges[it.t] && <span className="count-badge">{badges[it.t]}</span>}
          </button>
        ))}
      </div>
      <p className="prog-note">Xưởng, chuồng trại và máy tưới (nâng cấp) cũng có ngay trong nông trại: chạm vào để mở.</p>
    </Modal>
  );
}
