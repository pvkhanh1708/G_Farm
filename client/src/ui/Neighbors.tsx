import { useEffect, useState } from 'react';
import { CROPS } from '../game/config';
import { sfx } from '../game/audio/sfx';
import { farmApi, Neighbour, NewsItem } from '../game/net/farm';
import { NeighborIcon } from './icons';
import { Modal } from './Popups';
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

export function NeighborsPopup({ onVisit, onClose }: { onVisit: (id: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'list' | 'news'>('list');
  const [list, setList] = useState<Neighbour[] | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  useEffect(() => {
    let live = true;
    setError(null);
    (tab === 'list' ? farmApi.neighbours().then((l) => live && setList(l)) : farmApi.news().then((n) => live && setNews(n))).catch((e) => live && setError(e.message));
    return () => void (live = false);
  }, [tab]);
  return (
    <Modal title="Hàng xóm" icon={<NeighborIcon size={34} />} tone="green" onClose={onClose} wide>
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
                  <div key={n.id} className="lb-row visitable" onClick={() => onVisit(n.id)}>
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
                <div key={n.id} className={`lb-row news ${n.seen ? '' : 'unseen'} ${n.type}`} onClick={() => onVisit(n.actor.id)} title="Thăm lại">
                  <Avatar name={n.actor.name} url={n.actor.avatar} />
                  <span className="lb-name news-text">
                    {newsText(n)}
                    <small>{ago(n.at, now)} · chạm để sang thăm</small>
                  </span>
                </div>
              ))
            )}
          </div>
      </>
    </Modal>
  );
}
