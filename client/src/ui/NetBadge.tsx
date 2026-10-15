import { useSyncExternalStore } from 'react';
import { sync } from '../game/net/sync';

const LABEL = {
  connecting: 'Đang kết nối…',
  online: 'Đã đồng bộ',
  retrying: 'Mất kết nối · đang thử lại',
  offline: 'Ngoại tuyến · lưu trên máy',
};

/** Small corner tag showing whether progress is reaching the server. */
export function NetBadge() {
  const status = useSyncExternalStore(sync.subscribe, () => sync.status);
  return <div className={`build-tag net-${status}`}>{LABEL[status]}</div>;
}
