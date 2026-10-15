import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '../game/net/clock';
import { tienlen, tlBeats, tlCombo, TLLobby, TLView } from '../game/net/games';
import { sfx } from '../game/audio/sfx';
import { formatNum } from './format';
import { useGameState } from './Hud';
import { CoinIcon } from './icons';
import { fxBus } from './FxLayer';
import { errText, Shell, StakePicker, usePoll } from './GameRoom';

const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♠', '♣', '♦', '♥'];

function Card({ id, selected, onClick, small }: { id: number; selected?: boolean; onClick?: () => void; small?: boolean }) {
  const suit = id % 4;
  return (
    <button type="button" className={`card ${suit >= 2 ? 'red' : ''} ${selected ? 'sel' : ''} ${small ? 'small' : ''}`} onClick={onClick} disabled={!onClick}>
      <span className="card-rank">{RANKS[Math.floor(id / 4)]}</span>
      <span className="card-suit">{SUITS[suit]}</span>
    </button>
  );
}

const COMBO_NAME: Record<string, string> = { single: 'Lẻ', pair: 'Đôi', triple: 'Sám', four: 'Tứ quý', straight: 'Sảnh', pairs: 'Đôi thông' };

export function TienLenRoom({ onClose, tabs }: { onClose: () => void; tabs: React.ReactNode }) {
  const [table, setTable] = useState<TLView | null>(null);
  const [lobby, setLobby] = useState<TLLobby | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<TLView | void>) => {
    setBusy(true);
    try {
      const t = await fn();
      if (t) setTable(t);
      return true;
    } catch (e) {
      fxBus.toast(errText(e), 'bad');
      sfx.error();
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  usePoll(async () => {
    try {
      const l = await tienlen.lobby();
      setLobby(l);
      if (l.mine) setTable((t) => t ?? l.mine);
    } catch {
      /* keep the last list */
    }
  }, 3000, !table);

  usePoll(async () => {
    if (!table || table.status === 'finished' || table.status === 'cancelled') return;
    try {
      const t = await tienlen.table(table.id);
      setTable((cur) => (cur && cur.id === t.id && t.version >= cur.version ? t : cur));
    } catch {
      /* retry next tick */
    }
  }, 1000, !!table && (table.status === 'waiting' || table.status === 'playing'));

  return (
    <Shell onClose={onClose} title={table ? `Tiến lên · cược ${formatNum(table.stake)}` : 'Phòng game'}>
      {table ? (
        <TLTable t={table} busy={busy} run={run} onLeave={() => setTable(null)} />
      ) : (
        <>
          {tabs}
          <TLLobbyView lobby={lobby} busy={busy} run={run} />
        </>
      )}
    </Shell>
  );
}

function TLLobbyView({ lobby, busy, run }: { lobby: TLLobby | null; busy: boolean; run: (fn: () => Promise<TLView | void>) => void }) {
  const s = useGameState();
  return (
    <div className="lobby">
      <section className="lobby-card">
        <h3>Mở bàn tiến lên</h3>
        <p className="lobby-sub">Tiến lên miền Nam, tối đa 4 người; ghế trống do máy chơi. Ai hết bài trước nhận cả 4 phần cược (nhà cái giữ 5%).</p>
        <StakePicker busy={busy} onCreate={(stake) => run(() => tienlen.create(stake))} />
      </section>
      <section className="lobby-card">
        <h3>Bàn đang chờ</h3>
        {!lobby ? (
          <p className="lobby-sub">Đang tải…</p>
        ) : lobby.tables.length === 0 ? (
          <p className="lobby-sub">Chưa có bàn nào. Hãy mở bàn và bấm “Bắt đầu” để chơi với máy.</p>
        ) : (
          <ul className="table-list">
            {lobby.tables.map((t) => (
              <li key={t.id}>
                <span className="table-host">
                  {t.host} · {t.players}/4
                </span>
                <span className="table-stake">
                  <CoinIcon size={16} /> {formatNum(t.stake)}
                </span>
                <button className="btn btn-blue small" disabled={busy || t.stake > s.coins} onClick={() => run(() => tienlen.join(t.id))}>
                  {t.stake > s.coins ? 'Thiếu xu' : 'Vào bàn'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TLTable({ t, busy, run, onLeave }: { t: TLView; busy: boolean; run: (fn: () => Promise<TLView | void>) => Promise<boolean>; onLeave: () => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const i = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(i);
  }, []);
  // drop selected cards that are no longer in hand
  useEffect(() => setSel((s) => s.filter((c) => t.hand.includes(c))), [t.hand]);
  const prev = useRef(t.status);
  useEffect(() => {
    if (prev.current !== 'finished' && t.status === 'finished') (t.winner === t.you ? sfx.unlock : sfx.error).call(sfx);
    prev.current = t.status;
  }, [t.status, t.winner, t.you]);

  const me = t.you ?? 0;
  const rel = (seat: number) => (seat - me + 4) % 4; // 0 bottom, 1 right, 2 top, 3 left
  const myTurn = t.status === 'playing' && t.turn === me;
  const picked = tlCombo(sel);
  const canPlay = myTurn && !!picked && tlBeats(picked, t.combo) && (!t.firstTrick || sel.includes(0));
  const left = t.turnDeadline ? Math.max(0, Math.ceil((t.turnDeadline - now) / 1000)) : 0;

  if (t.status === 'waiting')
    return (
      <div className="tl-wait">
        <ul className="tl-seats">
          {t.seats.map((s, i) => (
            <li key={i} className={s.empty ? 'free' : ''}>
              {s.empty ? 'Ghế trống (máy sẽ chơi)' : s.name}
              {i === me && ' (bạn)'}
            </li>
          ))}
        </ul>
        <div className="row-center">
          <button className="btn btn-ghost" disabled={busy} onClick={() => void run(async () => (await tienlen.leave(t.id), onLeave()))}>
            {t.host ? 'Huỷ bàn' : 'Rời bàn'}
          </button>
          {t.host && (
            <button className="btn btn-green" disabled={busy} onClick={() => void run(() => tienlen.start(t.id))}>
              Bắt đầu
            </button>
          )}
        </div>
        {!t.host && <p className="tl-note">Đợi chủ bàn bắt đầu…</p>}
      </div>
    );

  const seatBox = (seat: number) => {
    const s = t.seats[seat];
    const active = t.status === 'playing' && t.turn === seat;
    return (
      <div key={seat} className={`tl-opp pos${rel(seat)} ${active ? 'turn' : ''} ${t.winner === seat ? 'won' : ''}`}>
        <b>{s.name}</b>
        <span className="tl-count">{s.cards} lá</span>
        {s.passed && <span className="tl-pass">Bỏ lượt</span>}
        {active && <span className="tl-clock">{left}s</span>}
      </div>
    );
  };

  const result =
    t.status === 'finished' ? (t.winner === me ? `Bạn về nhất! +${formatNum(t.payout)} xu` : `${t.seats[t.winner ?? 0].name} về nhất. Bạn mất ${formatNum(t.stake)} xu`) : null;

  return (
    <div className="tl">
      <div className="tl-board">
        {[1, 2, 3].map((r) => seatBox((me + r) % 4))}
        <div className="tl-center">
          {t.combo ? (
            <>
              <div className="tl-pile">
                {t.combo.cards.map((c) => (
                  <Card key={c} id={c} small />
                ))}
              </div>
              <small>
                {COMBO_NAME[t.combo.type]} · {t.seats[t.leader ?? 0].name}
              </small>
            </>
          ) : (
            <small className="tl-free">{t.status === 'playing' ? `${t.seats[t.turn ?? 0].name} đánh trước` : ''}</small>
          )}
          {t.lastAction?.kind === 'pass' && t.status === 'playing' && <small className="tl-last">{t.seats[t.lastAction.seat].name} bỏ lượt</small>}
        </div>
      </div>

      {result ? (
        <div className={`caro-result ${t.winner === me ? 'won' : 'lost'}`}>
          <b>{result}</b>
          <button className="btn btn-green" onClick={onLeave}>
            Về sảnh
          </button>
        </div>
      ) : (
        <>
          <div className={`tl-me ${myTurn ? 'turn' : ''}`}>
            <span>{myTurn ? `Tới lượt bạn · ${left}s` : `Đợi ${t.seats[t.turn ?? 0]?.name ?? ''}…`}</span>
            {t.firstTrick && myTurn && <span className="tl-hint">Lượt đầu phải có 3♠</span>}
          </div>
          <div className="tl-hand">
            {t.hand.map((c) => (
              <Card key={c} id={c} selected={sel.includes(c)} onClick={() => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} />
            ))}
          </div>
          <div className="tl-actions">
            <button className="btn btn-ghost small" disabled={!sel.length} onClick={() => setSel([])}>
              Bỏ chọn
            </button>
            <button className="btn btn-orange" disabled={!myTurn || !t.combo || busy} onClick={() => void run(() => tienlen.pass(t.id))}>
              Bỏ lượt
            </button>
            <button
              className="btn btn-green"
              disabled={!canPlay || busy}
              onClick={async () => {
                sfx.tap();
                if (await run(() => tienlen.play(t.id, sel))) setSel([]);
              }}
            >
              Đánh{picked ? ` ${COMBO_NAME[picked.type]}` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
