import type { NeighbourFarm } from '../game/net/farm';
import { DogIcon, HandIcon, WaterIcon } from './icons';

/** Top bar while visiting a neighbour's farm: whose farm, today's turns left, and the way home. */
export function VisitBar({ farm, tool, onTool, onHome }: { farm: NeighbourFarm; tool: 'steal' | 'help' | null; onTool: (t: 'steal' | 'help') => void; onHome: () => void }) {
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
      {/* pick a tool, then swipe over the crops: each one crossed is stolen / watered */}
      <div className="visit-tools">
        <button className={`visit-tool ${tool === 'steal' ? 'on' : ''}`} onClick={() => onTool('steal')}>
          <HandIcon size={40} />
          <b>Trộm</b>
        </button>
        <button className={`visit-tool ${tool === 'help' ? 'on' : ''}`} onClick={() => onTool('help')}>
          <WaterIcon size={40} />
          <b>Tưới</b>
        </button>
      </div>
    </>
  );
}
