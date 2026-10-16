import type { NeighbourFarm } from '../game/net/farm';
import { DogIcon, HandIcon, WaterIcon } from './icons';

/** Top bar while visiting a neighbour's farm: whose farm, today's turns left, and the way home. */
export function VisitBar({ farm, onHome }: { farm: NeighbourFarm; onHome: () => void }) {
  return (
    <>
      <div className="visit-bar">
        {farm.avatar ? <img className="lb-avatar" src={farm.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="lb-avatar">{farm.name.slice(0, 1).toUpperCase()}</span>}
        <div className="visit-who">
          <b>Nông trại của {farm.name}</b>
          <small>
            Cấp {farm.level}
            {farm.dog && (
              <>
                {' '}
                · <DogIcon size={16} /> có chó canh
              </>
            )}
          </small>
        </div>
        <button className="btn btn-green" onClick={onHome}>
          Về nhà
        </button>
      </div>
      <div className="visit-turns">
        <span>
          <HandIcon size={22} /> Hái trộm: {farm.stealsLeft}
        </span>
        <span>
          <WaterIcon size={22} /> Tưới giúp: {farm.helpsLeft}
        </span>
      </div>
    </>
  );
}
