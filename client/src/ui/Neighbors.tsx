import { useEffect, useState } from 'react';
import { CROPS, NEIGHBORS } from '../game/config';
import { sfx } from '../game/audio/sfx';
import { farmApi, Neighbour, NeighbourFarm, NewsItem } from '../game/net/farm';
import { bump, fxBus } from './FxLayer';
import { CropIcon, DogIcon, HandIcon, NeighborIcon, WaterIcon } from './icons';
import { Modal } from './Popups';
import { Busy, mmss, reward, run, useNow } from './Progress';
import { formatNum } from './format';

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  return url ? <img className="lb-avatar" src={url} alt="" referrerPolicy="no-referrer" /> : <span className="lb-avatar">{(name ?? '?').slice(0, 1).toUpperCase()}</span>;
}

function ago(ms: number, now: number) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

function newsText(n: NewsItem) {
  const who = n.actor.name ?? 'Ai đó';
  const crop = n.crop ? CROPS[n.crop]?.name.toLowerCase() : '';
  if (n.type === 'steal') return `${who} đã hái trộm ${n.qty} ${crop} của bạn`;
  if (n.type === 'caught') return `${who} định hái trộm ${crop} nhưng bị chó bắt, nộp phạt ${formatNum(n.coins)} xu cho bạn`;
  return `${who} đã tưới giúp ${crop} của bạn`;
}

/** One neighbour's farm: take ripe crops, water growing ones. */
function Visit({ id, onBack }: { id: number; onBack: () => void }) {
  const [farm, setFarm] = useState<NeighbourFarm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const now = useNow(1000);
  useEffect(() => {
    let live = true;
    farmApi.visit(id).then(
      (f) => live && setFarm(f),
      (e) => live && setError(e.message),
    );
    return () => void (live = false);
  }, [id]);
  if (error) return <p className="muted center">{error}</p>;
  if (!farm) return <p className="muted center">Đang tải nông trại…</p>;
  const byTile = new Map(farm.plantings.map((p) => [p.tile, p]));
  return (
    <>
      <div className="visit-head">
        <button className="btn btn-ghost small" onClick={() => (sfx.tap(), onBack())}>
          ← Quay lại
        </button>
        <Avatar name={farm.name} url={farm.avatar} />
        <div className="prog-info">
          <b>{farm.name}</b>
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
      </div>
      <div className="visit-limits">
        <span>
          <HandIcon size={18} /> Hái trộm còn {farm.stealsLeft} lần
        </span>
        <span>
          <WaterIcon size={18} /> Tưới giúp còn {farm.helpsLeft} lần
        </span>
      </div>
      <div className="panel-scroll">
        <div className="visit-grid">
          {Array.from({ length: farm.unlocked }, (_, tile) => {
            const p = byTile.get(tile);
            if (!p) return <div key={tile} className="visit-tile empty" />;
            const k = Math.max(0, Math.min(1, (now - p.plantedAt) / p.growMs));
            const ripe = k >= 1;
            const act = async (kind: 'steal' | 'help', from: DOMRect) => {
              setBusy(tile);
              if (kind === 'steal') {
                const res = await run(() => farmApi.steal(id, tile));
                setBusy(null);
                if (!res) return;
                setFarm(res.farm);
                if (res.caught) {
                  sfx.error();
                  fxBus.toast(`Gâu gâu! Bị chó bắt, nộp phạt ${formatNum(res.fine)} xu`, 'bad');
                } else {
                  sfx.collect();
                  fxBus.fly({ type: 'crop', crop: res.crop }, { x: from.left + from.width / 2, y: from.top }, 'inventory', Math.min(res.qty, 4), () => bump('inventory'));
                  fxBus.toast(`Hái trộm được ${res.qty} ${CROPS[res.crop].name.toLowerCase()}!`, 'good');
                }
              } else {
                const res = await run(() => farmApi.help(id, tile));
                setBusy(null);
                if (!res) return;
                setFarm(res.farm);
                sfx.plant();
                reward(from, res.coins, res.xp, res.levelUps);
              }
            };
            return (
              <div key={tile} className={`visit-tile ${ripe ? 'ripe' : ''}`}>
                <CropIcon crop={p.crop} size={ripe ? 40 : 22 + 14 * k} />
                {ripe ? (
                  p.steal > 0 ? (
                    <button className="btn btn-orange small" disabled={busy !== null || farm.stealsLeft <= 0} onClick={(e) => act('steal', e.currentTarget.getBoundingClientRect())}>
                      <Busy on={busy === tile}>
                        <HandIcon size={16} /> +{p.steal}
                      </Busy>
                    </button>
                  ) : (
                    <small className="muted">Đã hái</small>
                  )
                ) : (
                  <>
                    <div className="job-bar">
                      <div style={{ width: `${k * 100}%` }} />
                    </div>
                    {p.helped ? (
                      <small className="muted">Đã tưới</small>
                    ) : (
                      <button className="btn btn-blue small" disabled={busy !== null || farm.helpsLeft <= 0} onClick={(e) => act('help', e.currentTarget.getBoundingClientRect())}>
                        <Busy on={busy === tile}>
                          <WaterIcon size={16} /> Tưới
                        </Busy>
                      </button>
                    )}
                    <small className="muted">{mmss(Math.ceil((p.plantedAt + p.growMs - now) / 1000))}</small>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="prog-note">
          Mỗi ô chín hái trộm được {Math.round(NEIGHBORS.stealShare * 100)}% sản lượng, tối đa {NEIGHBORS.maxThieves} người mỗi ô. Tưới giúp làm cây lớn nhanh hơn và bạn được +{NEIGHBORS.helpCoins} xu, +{NEIGHBORS.helpXp} XP.
        </p>
      </div>
    </>
  );
}

export function NeighborsPopup({ visit, onClose }: { visit?: number; onClose: () => void }) {
  const [tab, setTab] = useState<'list' | 'news'>('list');
  const [visiting, setVisiting] = useState<number | null>(visit ?? null);
  const [list, setList] = useState<Neighbour[] | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  useEffect(() => {
    if (visiting !== null) return;
    let live = true;
    setError(null);
    (tab === 'list' ? farmApi.neighbours().then((l) => live && setList(l)) : farmApi.news().then((n) => live && setNews(n))).catch((e) => live && setError(e.message));
    return () => void (live = false);
  }, [tab, visiting]);
  return (
    <Modal title="Hàng xóm" icon={<NeighborIcon size={34} />} tone="green" onClose={onClose} wide>
      {visiting !== null ? (
        <Visit id={visiting} onBack={() => setVisiting(null)} />
      ) : (
        <>
          <div className="segmented lb-tabs">
            <button className={tab === 'list' ? 'on' : ''} onClick={() => (sfx.tap(), setTab('list'))}>
              Đi thăm
            </button>
            <button className={tab === 'news' ? 'on' : ''} onClick={() => (sfx.tap(), setTab('news'))}>
              Nhật ký
            </button>
          </div>
          <div className="panel-scroll lb-list">
            {error ? (
              <p className="muted center">{error}</p>
            ) : tab === 'list' ? (
              !list ? (
                <p className="muted center">Đang tải…</p>
              ) : !list.length ? (
                <p className="muted center">Chưa có hàng xóm nào.</p>
              ) : (
                list.map((n) => (
                  <div key={n.id} className="lb-row visitable" onClick={() => (sfx.open(), setVisiting(n.id))}>
                    <Avatar name={n.name} url={n.avatar} />
                    <span className="lb-name">
                      {n.name}
                      <small>
                        Cấp {n.level}
                        {n.dog ? ' · có chó canh' : ''}
                      </small>
                    </span>
                    {n.ripe > 0 ? <span className="pill ripe-pill">{n.ripe} ô chín</span> : <span className="muted">Thăm</span>}
                  </div>
                ))
              )
            ) : !news ? (
              <p className="muted center">Đang tải…</p>
            ) : !news.length ? (
              <p className="muted center">Chưa có ai ghé nông trại của bạn.</p>
            ) : (
              news.map((n) => (
                <div key={n.id} className={`lb-row news ${n.seen ? '' : 'unseen'} ${n.type}`} onClick={() => (sfx.open(), setVisiting(n.actor.id))} title="Thăm lại">
                  <Avatar name={n.actor.name} url={n.actor.avatar} />
                  <span className="lb-name news-text">
                    {newsText(n)}
                    <small>{ago(n.at, now)} · chạm để ghé thăm lại</small>
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
