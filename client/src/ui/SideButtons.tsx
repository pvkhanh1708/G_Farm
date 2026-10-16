import { AnimalIcon, CardsIcon, NeighborIcon, OrderIcon, QuestIcon, TrophyIcon, UpgradeIcon, WorkshopIcon } from './icons';

type Target = 'room' | 'quests' | 'orders' | 'animals' | 'workshop' | 'neighbors' | 'upgrades' | 'ranks';

/** Column of round buttons on the right edge, under the coin bar. */
export function SideButtons({ quests, orders, animals, workshop, neighbors, onOpen }: { quests: number; orders: number; animals: number; workshop: number; neighbors: number; onOpen: (t: Target) => void }) {
  const items: Array<{ t: Target; label: string; icon: React.ReactNode; badge?: number }> = [
    { t: 'quests', label: 'Nhiệm vụ', icon: <QuestIcon size={30} />, badge: quests },
    { t: 'orders', label: 'Đơn hàng', icon: <OrderIcon size={30} />, badge: orders },
    { t: 'animals', label: 'Chuồng', icon: <AnimalIcon type="chicken" size={30} />, badge: animals },
    { t: 'workshop', label: 'Xưởng', icon: <WorkshopIcon size={30} />, badge: workshop },
    { t: 'neighbors', label: 'Hàng xóm', icon: <NeighborIcon size={30} />, badge: neighbors },
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
