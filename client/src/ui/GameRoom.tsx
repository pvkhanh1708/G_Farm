import { TienLenRoom } from './TienLenRoom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '../game/net/clock';
import { ApiError } from '../game/net/api';
import { games, Lobby, MIN_STAKE, TableView } from '../game/net/games';
import { sync } from '../game/net/sync';
import { sfx } from '../game/audio/sfx';
import { formatNum } from './format';
import { useGameState } from './Hud';
import { CloseIcon, CoinIcon } from './icons';
import { fxBus } from './FxLayer';

const STAKE_PRESETS = [100, 1_000, 10_000, 100_000, 1_000_000];

export const errText = (e: unknown) => (e instanceof ApiError ? e.firstError : 'Không kết nối được máy chủ');

/** Poll `fn` every `ms` while mounted (and once immediately). */
export function usePoll(fn: () => Promise<void> | void, ms: number, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      try {
        await ref.current();
      } finally {
        if (!stop) timer = window.setTimeout(tick, ms);
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [ms, active]);
}

type RoomGame = 'caro' | 'tienlen';
const TAB_KEY = 'farm-empire:room-game';

/** Full-screen game room with one tab per game. */
export function GameRoom({ onClose }: { onClose: () => void }) {
  const [game, setGame] = useState<RoomGame>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as RoomGame) || 'caro';
    } catch {
      return 'caro';
    }
  });
  const pick = (g: RoomGame) => {
    setGame(g);
    try {
      localStorage.setItem(TAB_KEY, g);
    } catch {
      /* session only */
    }
  };
  const tabs = (
    <div className="segmented room-tabs">
      <button className={game === 'caro' ? 'on' : ''} onClick={() => pick('caro')}>
        Cờ caro
      </button>
      <button className={game === 'tienlen' ? 'on' : ''} onClick={() => pick('tienlen')}>
        Tiến lên
      </button>
    </div>
  );
  if (sync.status === 'offline')
    return (
      <Shell onClose={onClose}>
        <p className="room-empty">Phòng game cần kết nối máy chủ. Hãy kết nối mạng rồi thử lại.</p>
      </Shell>
    );
  return game === 'caro' ? <CaroRoom onClose={onClose} tabs={tabs} /> : <TienLenRoom onClose={onClose} tabs={tabs} />;
}

function CaroRoom({ onClose, tabs }: { onClose: () => void; tabs: React.ReactNode }) {
  const [table, setTable] = useState<TableView | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<TableView | void>) => {
    setBusy(true);
    try {
      const t = await fn();
      if (t) setTable(t);
    } catch (e) {
      fxBus.toast(errText(e), 'bad');
      sfx.error();
    } finally {
      setBusy(false);
    }
  }, []);

  // lobby (and resume an unfinished table of mine)
  usePoll(async () => {
    try {
      const l = await games.lobby();
      setLobby(l);
      if (l.mine) setTable((t) => t ?? l.mine);
    } catch {
      /* keep the last list */
    }
  }, 3000, !table);

  // the table I sit at
  usePoll(async () => {
    if (!table || table.status === 'finished' || table.status === 'cancelled') return;
    try {
      const t = await games.table(table.id);
      setTable((cur) => (cur && cur.id === t.id && t.version >= cur.version ? t : cur));
    } catch {
      /* retry next tick */
    }
  }, 1000, !!table && (table.status === 'waiting' || table.status === 'playing'));

  return (
    <Shell onClose={onClose} title={table ? `Cờ caro · cược ${formatNum(table.stake)}` : 'Phòng game'}>
      {table ? (
        <CaroTable table={table} busy={busy} run={run} onLeave={() => setTable(null)} />
      ) : (
        <>
          {tabs}
          <LobbyView lobby={lobby} busy={busy} run={run} />
        </>
      )}
    </Shell>
  );
}

export function Shell({ title = 'Phòng game', onClose, children }: { title?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="room" role="dialog" aria-label={title}>
      <div className="room-bar">
        <b>{title}</b>
        <RoomCoins />
        <button className="panel-close room-close" onClick={onClose} aria-label="Đóng">
          <CloseIcon size={22} />
        </button>
      </div>
      <div className="room-body">{children}</div>
    </div>
  );
}

function RoomCoins() {
  const s = useGameState();
  return (
    <span className="room-coins">
      <CoinIcon size={20} /> {formatNum(s.coins)}
    </span>
  );
}

// ---------------------------------------------------------------- lobby

/** Stake presets + formatted input + create button. */
export function StakePicker({ busy, onCreate }: { busy: boolean; onCreate: (stake: number) => void }) {
  const s = useGameState();
  const [stake, setStake] = useState(MIN_STAKE);
  const valid = stake >= MIN_STAKE && stake <= s.coins;
  return (
    <>
        <div className="stake-presets">
          {STAKE_PRESETS.map((v) => (
            <button key={v} className={`chip ${stake === v ? 'on' : ''}`} disabled={v > s.coins} onClick={() => setStake(v)}>
              {formatNum(v)}
            </button>
          ))}
        </div>
        <label className="stake-input">
          Mức cược
          {/* text, not number: shows thousands separators (1.000.000) while typing */}
          <input
            type="text"
            inputMode="numeric"
            value={stake ? stake.toLocaleString('vi-VN') : ''}
            onChange={(e) => setStake(Math.min(1e12, Number(e.target.value.replace(/\D/g, '')) || 0))}
          />
          <CoinIcon size={20} />
        </label>
        {!valid && <p className="warn">{stake < MIN_STAKE ? `Cược tối thiểu ${MIN_STAKE} xu` : 'Không đủ xu'}</p>}
        <button className="btn btn-green" disabled={busy || !valid} onClick={() => onCreate(stake)}>
          Tạo bàn
        </button>
    </>
  );
}

function LobbyView({ lobby, busy, run }: { lobby: Lobby | null; busy: boolean; run: (fn: () => Promise<TableView | void>) => void }) {
  const s = useGameState();
  return (
    <div className="lobby">
      <section className="lobby-card">
        <h3>Mở bàn cờ caro</h3>
        <p className="lobby-sub">15×15, 5 quân liên tiếp là thắng. Người thắng nhận cả 2 phần cược (nhà cái giữ 5%).</p>
        <StakePicker busy={busy} onCreate={(stake) => run(() => games.create(stake))} />
      </section>

      <section className="lobby-card">
        <h3>Bàn đang chờ</h3>
        {!lobby ? (
          <p className="lobby-sub">Đang tải…</p>
        ) : lobby.tables.length === 0 ? (
          <p className="lobby-sub">Chưa có bàn nào. Hãy mở bàn: nếu không ai vào, bạn có thể chơi với máy.</p>
        ) : (
          <ul className="table-list">
            {lobby.tables.map((t) => (
              <li key={t.id}>
                <span className="table-host">{t.host}</span>
                <span className="table-stake">
                  <CoinIcon size={16} /> {formatNum(t.stake)}
                </span>
                <button className="btn btn-blue small" disabled={busy || t.stake > s.coins} onClick={() => run(() => games.join(t.id))}>
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

// ---------------------------------------------------------------- table

function CaroTable({ table: t, busy, run, onLeave }: { table: TableView; busy: boolean; run: (fn: () => Promise<TableView | void>) => void; onLeave: () => void }) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const i = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(i);
  }, []);
  const prevStatus = useRef(t.status);
  useEffect(() => {
    if (prevStatus.current !== 'finished' && t.status === 'finished') {
      if (t.winner === t.you) sfx.unlock();
      else sfx.error();
    }
    prevStatus.current = t.status;
  }, [t.status, t.winner, t.you]);

  const me = t.you ?? 1;
  const myTurn = t.status === 'playing' && t.turn === me;
  const left = t.turnDeadline ? Math.max(0, Math.ceil((t.turnDeadline - now) / 1000)) : 0;
  const win = new Set((t.winLine ?? []).map(([x, y]) => y * t.size + x));
  const last = t.lastMove ? t.lastMove[1] * t.size + t.lastMove[0] : -1;

  if (t.status === 'waiting')
    return (
      <div className="table-wait">
        <div className="spinner" />
        <p>
          Đang chờ người chơi vào bàn…
          <br />
          Cược <b>{formatNum(t.stake)}</b> xu
        </p>
        <div className="row-center">
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(async () => (await games.cancel(t.id), onLeave()))}>
            Huỷ bàn
          </button>
          <button className="btn btn-green" disabled={busy} onClick={() => run(() => games.bot(t.id))}>
            Chơi với máy
          </button>
        </div>
      </div>
    );

  const result =
    t.status !== 'finished'
      ? null
      : t.winner === 0
        ? 'Hoà! Đã trả lại tiền cược.'
        : t.winner === me
          ? `Bạn thắng! +${formatNum(t.payout)} xu${t.endReason === 'timeout' ? ' (đối thủ hết giờ)' : t.endReason === 'resign' ? ' (đối thủ bỏ cuộc)' : ''}`
          : `Bạn thua${t.endReason === 'timeout' ? ' (hết giờ)' : t.endReason === 'resign' ? ' (bỏ cuộc)' : ''}. -${formatNum(t.stake)} xu`;

  return (
    <div className="caro">
      <div className="caro-players">
        {([1, 2] as const).map((side) => (
          <div key={side} className={`caro-player ${t.status === 'playing' && t.turn === side ? 'turn' : ''}`}>
            <span className={`mark m${side}`}>{side === 1 ? '✕' : '◯'}</span>
            <span className="caro-name">
              {t.players[side] ?? '…'}
              {side === me && ' (bạn)'}
            </span>
            {t.status === 'playing' && t.turn === side && <span className="caro-clock">{left}s</span>}
          </div>
        ))}
      </div>
      <div className="caro-board" style={{ gridTemplateColumns: `repeat(${t.size}, 1fr)` }}>
        {t.board.map((v, i) => (
          <button
            key={i}
            className={`cell ${v ? 'm' + v : ''} ${i === last ? 'last' : ''} ${win.has(i) ? 'win' : ''}`}
            disabled={!myTurn || v !== 0 || busy}
            onClick={() => {
              sfx.tap();
              run(() => games.move(t.id, i % t.size, Math.floor(i / t.size)));
            }}
            aria-label={`${i % t.size + 1}, ${Math.floor(i / t.size) + 1}`}
          >
            {v === 1 ? '✕' : v === 2 ? '◯' : ''}
          </button>
        ))}
      </div>
      {result ? (
        <div className={`caro-result ${t.winner === me ? 'won' : t.winner === 0 ? 'draw' : 'lost'}`}>
          <b>{result}</b>
          <button className="btn btn-green" onClick={onLeave}>
            Về sảnh
          </button>
        </div>
      ) : (
        <div className="caro-foot">
          <span>{myTurn ? 'Tới lượt bạn' : t.vsBot ? 'Máy đang nghĩ…' : 'Đợi đối thủ…'}</span>
          <button className="btn btn-ghost small" disabled={busy} onClick={() => confirm('Bỏ cuộc và mất tiền cược?') && run(() => games.resign(t.id))}>
            Bỏ cuộc
          </button>
        </div>
      )}
    </div>
  );
}
