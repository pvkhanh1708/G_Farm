import { AnimalIcon, CardsIcon, OrderIcon, QuestIcon, TrophyIcon, UpgradeIcon } from './icons';

type Target = 'room' | 'quests' | 'orders' | 'animals' | 'upgrades' | 'ranks';

/** Column of round buttons on the right edge, under the coin bar. */
export function SideButtons({ quests, orders, animals, onOpen }: { quests: number; orders: number; animals: number; onOpen: (t: Target) => void }) {
  const items: Array<{ t: Target; label: string; icon: React.ReactNode; badge?: number }> = [
    { t: 'quests', label: 'Nhiệm vụ', icon: <QuestIcon size={30} />, badge: quests },
    { t: 'orders', label: 'Đơn hàng', icon: <OrderIcon size={30} />, badge: orders },
    { t: 'animals', label: 'Chuồng', icon: <AnimalIcon type="chicken" size={30} />, badge: animals },
    { t: 'upgrades', label: 'Nâng cấp', icon: <UpgradeIcon size={30} /> },
    { t: 'ranks', label: 'Xếp hạng', icon: <TrophyIcon size={30} /> },
    { t: 'room', label: 'Phòng game', icon: <CardsIcon size={30} /> },
  ];
  return (
    <div className="side-col">
      {items.map((it) => (
        <button key={it.t} className="round-btn small side-btn" onClick={() => onOpen(it.t)} aria-label={it.label}>
          {it.icon}
          <span className="round-btn-label">{it.label}</span>
          {!!it.badge && <span className="count-badge">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}
