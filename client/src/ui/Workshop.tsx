import { useState } from 'react';
import { GOODS, ItemId, itemDef, MachineDef, MachineId, MACHINES } from '../game/config';
import { sfx } from '../game/audio/sfx';
import { farmApi } from '../game/net/farm';
import type { GameState } from '../game/state/store';
import { fxBus } from './FxLayer';
import { useGameState } from './Hud';
import { BreadIcon, CheeseIcon, ClockIcon, CoinIcon, FlourIcon, ItemIcon, WorkshopIcon, XpIcon } from './icons';
import { CROP_BG, Modal } from './Popups';
import { Busy, mmss, reward, run, useNow } from './Progress';
import { formatNum } from './format';

const MACHINE_ICON: Record<MachineId, (p: { size?: number }) => React.JSX.Element> = { mill: FlourIcon, bakery: BreadIcon, dairy: CheeseIcon };

/** Finished batches waiting in the machines: the badge on the workshop button. */
export function finishedJobs(s: GameState, now: number) {
  return Object.values(s.machines).reduce((n, m) => n + (m?.queue.filter((j) => j.readyAt <= now).length ?? 0), 0);
}

function Machine({ m, now }: { m: MachineDef; now: number }) {
  const s = useGameState();
  const [busy, setBusy] = useState<string | null>(null);
  const owned = s.machines[m.id];
  const Icon = MACHINE_ICON[m.id];
  const queue = owned?.queue ?? [];
  const done = queue.filter((j) => j.readyAt <= now).length;
  return (
    <div className="machine">
      <div className="machine-head">
        <div className="prog-art">
          <Icon size={40} />
        </div>
        <div className="prog-info">
          <b>{m.name}</b>
          <small>{m.recipes.map((r) => GOODS[r.output].name).join(', ')}</small>
        </div>
        {!owned &&
          (s.level < m.unlockLevel ? (
            <span className="muted">Cấp {m.unlockLevel}</span>
          ) : (
            <button
              className="btn btn-orange small"
              disabled={!!busy || s.coins < m.price}
              onClick={async () => {
                setBusy('buy');
                const res = await run(() => farmApi.buyMachine(m.id));
                setBusy(null);
                if (res !== null) {
                  sfx.unlock();
                  fxBus.toast(`Đã xây ${m.name}!`, 'good');
                }
              }}
            >
              <Busy on={busy === 'buy'}>
                Xây <CoinIcon size={16} /> {formatNum(m.price)}
              </Busy>
            </button>
          ))}
        {owned && done > 0 && (
          <button
            className="btn btn-green small"
            disabled={!!busy}
            onClick={async (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setBusy('collect');
              const res = await run(() => farmApi.collectGoods(m.id));
              setBusy(null);
              if (res) {
                sfx.collect();
                reward(r, 0, res.xp, res.levelUps);
              }
            }}
          >
            <Busy on={busy === 'collect'}>Thu ({done})</Busy>
          </button>
        )}
      </div>
      {owned && (
        <>
          <div className="machine-queue">
            {Array.from({ length: m.queue }, (_, i) => {
              const job = queue[i];
              if (!job) return <div key={i} className="job empty" />;
              const recipe = m.recipes.find((r) => r.output === job.output)!;
              const start = i === 0 ? job.readyAt - recipe.seconds * 1000 : Math.max(queue[i - 1].readyAt, job.readyAt - recipe.seconds * 1000);
              const k = Math.max(0, Math.min(1, (now - start) / (job.readyAt - start)));
              const ready = job.readyAt <= now;
              return (
                <div key={i} className={`job ${ready ? 'ready' : ''}`} style={{ background: CROP_BG[job.output] }}>
                  <ItemIcon item={job.output} size={30} />
                  <span>{ready ? 'Xong' : mmss(Math.ceil((job.readyAt - now) / 1000))}</span>
                  {!ready && (
                    <div className="job-bar">
                      <div style={{ width: `${k * 100}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="recipes">
            {m.recipes.map((r) => {
              const g = GOODS[r.output];
              const inputs = Object.entries(r.inputs) as Array<[ItemId, number]>;
              const enough = inputs.every(([id, n]) => s.inventory[id] >= n);
              const full = queue.length >= m.queue;
              return (
                <div className="recipe" key={r.output}>
                  <div className="recipe-out" style={{ background: CROP_BG[r.output] }}>
                    <ItemIcon item={r.output} size={36} />
                  </div>
                  <div className="prog-info">
                    <b>{g.name}</b>
                    <div className="recipe-in">
                      {inputs.map(([id, n]) => (
                        <span key={id} className={s.inventory[id] >= n ? 'ok' : 'short'} title={itemDef(id).name}>
                          <ItemIcon item={id} size={18} /> {formatNum(s.inventory[id])}/{n}
                        </span>
                      ))}
                    </div>
                    <small>
                      <ClockIcon size={13} /> {mmss(r.seconds)} · <CoinIcon size={13} /> {formatNum(g.sellPrice)} · <XpIcon size={13} /> {g.xp}
                    </small>
                  </div>
                  <button
                    className="btn btn-blue small"
                    disabled={!!busy || !enough || full}
                    onClick={async () => {
                      setBusy(r.output);
                      const res = await run(() => farmApi.startJob(m.id, r.output));
                      setBusy(null);
                      if (res) sfx.plant();
                    }}
                  >
                    <Busy on={busy === r.output}>{full ? 'Đầy' : 'Làm'}</Busy>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function WorkshopPopup({ onClose }: { onClose: () => void }) {
  const now = useNow(1000);
  return (
    <Modal title="Xưởng chế biến" icon={<WorkshopIcon size={34} />} tone="orange" onClose={onClose} wide>
      <div className="panel-scroll">
        <p className="prog-note">Biến nông sản thành hàng bán giá cao. Mỗi máy xếp được 3 mẻ, làm lần lượt; xong thì bấm “Thu”.</p>
        {MACHINES.map((m) => (
          <Machine key={m.id} m={m} now={now} />
        ))}
      </div>
    </Modal>
  );
}

