# Nông Trại Vui Vẻ

Bản thử nghiệm chất lượng hình ảnh và cảm giác chơi trước khi làm gameplay đầy đủ.
Phạm vi: nông trại nhìn từ trên xuống (ô đất và cây dạng 2D trên đảo 3D), 15 loại cây × 5 giai đoạn, hệ thống kinh nghiệm/cấp độ, và chu trình
trồng → thu hoạch → bán → mở rộng đất, chạy trực tiếp trên trình duyệt.

Nông trại nhìn **chéo kiểu isometric, góc cố định, không zoom** (kéo để di chuyển). Ô đất nằm sát nhau thành một khối:
mỗi **cột 10 ô**, mở theo thứ tự; hết một cột thì sang cột mới nằm **bên trái** cột cũ, không giới hạn số cột.
**Phòng game** (nút góc phải): mở bàn cờ caro với mức cược tự đặt; người khác vào bàn hoặc chơi với máy. Người thắng nhận cả
2 phần cược trừ 5% phí; hoà hoàn tiền; mỗi lượt 60 giây. **Tiến lên** (miền Nam): bàn tối đa 4 người, chủ bàn bấm “Bắt đầu” thì ghế trống do máy chơi; ai hết bài trước nhận cả 4 phần cược
trừ 5% phí; mỗi lượt 30 giây (hết giờ tự bỏ lượt). Cờ vây sẽ làm sau.
Chạm ô cây đang lớn để xem thời gian còn lại, **bón phân** (giảm một nửa thời gian còn lại, giá 35% tiền hạt) và **đào cây**
(một ô, hoặc mọi ô cùng loại cây đang lớn). Cây chín có bong bóng ngôi sao phía trên; **kéo ngón tay** bắt đầu từ một cây chín để thu
cả dãy, hoặc khi đang “Gieo nhanh” thì kéo qua các ô trống để gieo.

**Cột nút bên phải:** *Nhiệm vụ* (3–4 nhiệm vụ mỗi ngày theo giờ Việt Nam + quà đăng nhập 7 ngày liên tiếp, tự hiện khi vào game),
*Đơn hàng* (từ cấp 3: 3 đơn, giao đủ hàng nhận ×1,6 giá chợ và ×1,5 XP; “Đổi” để lấy đơn khác), *Chuồng* (gà từ cấp 6 đẻ trứng
mỗi 5 phút, bò từ cấp 15 cho sữa mỗi 15 phút; chuồng gà và chuồng bò riêng, bên phải nông trại; chạm con vật để thu), *Nâng cấp* (Đất màu mỡ +10%
sản lượng/cấp, Máy tưới −6% thời gian lớn/cấp), *Xếp hạng* (nông trại: xu / cấp / số ô đất; phòng game: số trận thắng / tiền thắng
ròng) và *Phòng game*.
**Nhạc nền** nhẹ tự sinh bằng WebAudio, bật/tắt trong Cài đặt.

**Chăn nuôi:** gà ăn 3 lúa mì, bò ăn 2 ngô thì mới đẻ trứng / cho sữa (sau 5 / 15 phút); thu xong con vật đói lại.
Mỗi chuồng có máng nước (cạn sau 2 giờ, chạm để đổ đầy; cạn thì con vật không ăn) và máng ăn (đầy khi có con đã ăn). Chạm máng ăn hoặc con đói để cho ăn; trứng / bình sữa nằm cạnh con vật khi có sản phẩm, chạm để thu. Ảnh đồ trong chuồng: `client/src/assets/sprites/props/`. **Chó canh** (cấp 8) bắt quả tang 40% kẻ hái trộm, tiền phạt về chủ.
**Xưởng chế biến:** Cối xay (cấp 4: 3 lúa mì → bột mì), Lò bánh (cấp 7: bánh mì, bánh dâu), Xưởng sữa (cấp 15: phô mai,
sữa chua dâu); mỗi máy xếp 3 mẻ làm lần lượt. Hàng chế biến bán giá cao và có thể xuất hiện trong đơn hàng.
**Hàng xóm:** đi thăm nông trại người khác (nút Hàng xóm, hoặc chạm tên trong Xếp hạng): hái trộm 25% sản lượng một ô chín
(tối đa 2 người mỗi ô, 20 lần/ngày, chủ luôn còn ít nhất 1), tưới giúp cây đang lớn (-10% thời gian còn lại, +5 xu +2 XP,
10 lần/ngày). Nhật ký cho chủ biết ai đã hái trộm / tưới giúp, chạm để ghé thăm lại.

**Cấp độ:** mỗi lần thu hoạch cho XP (cây càng cao cấp càng nhiều XP). Mỗi cấp cho mở thêm **1 ô đất**
(tối đa `4 + cấp` ô), thưởng `20 × cấp` xu và mở khóa hạt giống mới theo lịch. XP cần để lên cấp kế tiếp:
`5 × cấp^2.1`. Giá ô đất thứ n: `40 + 20 × (n − 4)^2.4` xu. Toàn bộ số liệu nằm trong
`client/src/game/config.ts`; nhịp độ được cân bằng bằng mô phỏng người chơi tích cực
(cấp 10 ≈ 30 phút, cấp 30 ≈ 5 giờ, cấp 70 ≈ 20 giờ).

**Hai loại cây:** *Cày tiền* (lãi ×1,5, XP ×0,5) để kiếm xu mua đất, *Cày cấp* (lãi ×0,55, XP ×1,8) để lên cấp mở
thêm đất và cây. Bảng cây được sinh và mô phỏng nhịp chơi bằng `cd client && node scripts/economy.mjs` (thêm `--write` để ghi
vào `shared/economy.json`).

| Cây | Loại | Cấp mở | Hạt | Thời gian | Thu | Giá bán | XP | Lãi/ô |
|---|---|---|---|---|---|---|---|---|
x| Cà rốt | Cày tiền | 1 | 7 | 20s | ×4 | 6 | 1 | +17 |
x| Lúa mì | Cày cấp | 2 | 12 | 30s | ×5 | 4 | 3 | +8 |
x| Cà chua | Cày tiền | 3 | 22 | 45s | ×6 | 11 | 1 | +44 |
x| Dâu tây | Cày cấp | 5 | 34 | 1 phút | ×5 | 12 | 7 | +26 |
x| Khoai tây | Cày cấp | 7 | 49 | 1p15s | ×6 | 15 | 10 | +41 |
x| Bắp cải | Cày cấp | 9 | 69 | 1p30s | ×3 | 41 | 13 | +54 |
x| Ngô | Cày tiền | 11 | 110 | 2 phút | ×4 | 85 | 5 | +230 |
x| Ớt | Cày cấp | 13 | 160 | 2p30s | ×8 | 35 | 26 | +120 |
x| Cà tím | Cày tiền | 15 | 220 | 3 phút | ×5 | 140 | 10 | +480 |
x| Dưa hấu | Cày tiền | 18 | 345 | 4 phút | ×2 | 540 | 14 | +735 |
x| Bí ngô | Cày tiền | 21 | 505 | 5 phút | ×2 | 795 | 19 | +1.085 |
x| Dứa | Cày tiền | 24 | 710 | 6 phút | ×2 | 1.115 | 26 | +1.520 |
x| Bông | Cày cấp | 27 | 1.105 | 8 phút | ×6 | 330 | 136 | +875 |
x| Oải hương | Cày cấp | 30 | 1.615 | 10 phút | ×5 | 575 | 186 | +1.260 |
x| Hướng dương | Cày tiền | 34 | 2.270 | 12 phút | ×3 | 2.380 | 68 | +4.870 |
x| Trà | Cày cấp | 36 | 3.100 | 14 phút | ×6 | 920 | 316 | +2.420 |
x| Nho | Cày tiền | 38 | 3.885 | 15 phút | ×6 | 2.035 | 103 | +8.325 |
x| Cà phê | Cày cấp | 41 | 5.455 | 18 phút | ×5 | 1.950 | 491 | +4.295 |
x| Thanh long | Cày tiền | 44 | 7.090 | 20 phút | ×3 | 7.425 | 167 | +15.185 |
x| Hoa hồng | Cày cấp | 47 | 10.350 | 25 phút | ×4 | 4.625 | 826 | +8.150 |
| Sầu riêng | Cày tiền | 50 | 14.550 | 30 phút | ×1 | 45.750 | 303 | +31.200 |
| Hoa lan | Cày cấp | 54 | 19.850 | 35 phút | ×3 | 11.800 | 1.399 | +15.550 |
| Nhân sâm | Cày tiền | 58 | 26.550 | 40 phút | ×2 | 41.750 | 488 | +56.950 |
| Nghệ tây | Cày cấp | 63 | 38.850 | 50 phút | ×4 | 17.350 | 2.418 | +30.550 |
| Dưa lưới | Cày tiền | 70 | 54.550 | 60 phút | ×2 | 85.750 | 886 | +116.950 |


> Đồ họa **chưa hoàn thiện**: hình cây / ô đất và cảnh đều là placeholder thủ tục. Xem [ASSETS.md](ASSETS.md).
> Ảnh chụp màn hình nằm trong [docs/screenshots/](docs/screenshots/).

## Chạy thử

Cần PHP 8.2+ (đang dùng 8.4), Composer, MySQL 8, Node 20+. Với Laragon: bật MySQL bằng “Start All”.

```bash
# 1. Backend (Laravel 12) — lần đầu
cd server
composer install
cp .env.example .env && php artisan key:generate   # .env đã trỏ MySQL farm_empire, user root, không mật khẩu
mysql -uroot -e "create database if not exists farm_empire character set utf8mb4 collate utf8mb4_unicode_ci"
php artisan migrate
php artisan serve                                   # API tại http://127.0.0.1:8000 (vd. /farm)

# 2. Client
cd client
npm install
npm run dev          # http://localhost:5173 — Vite chuyển /api/* sang 127.0.0.1:8000/*
npm run build        # bản production -> game/ (được commit vào git, xem DEPLOY.md)
npm run preview      # chạy thử bản production tại http://localhost:4173 (cũng proxy /api)
```

Triển khai lên server (nongtrai.io.vn + api.nongtrai.io.vn): xem **[DEPLOY.md](DEPLOY.md)**.
`npm run build` nhúng địa chỉ API từ `client/.env.production`; khi chạy local bằng `npm run dev` thì dùng proxy `/api`.
Sửa `client/` hoặc `shared/` thì **build lại và commit cả `game/`** trước khi push: hosting không có Node, `git pull` lấy luôn bản build.

Tham số URL: `?showcase` xem mọi cây × 5 giai đoạn (`?showcase=corn,chili` để lọc), `?offline` chơi không cần server.
Nếu không kết nối được API khi mở game, game tự chuyển sang chơi ngoại tuyến (lưu trên máy) và hiện nhãn “Ngoại tuyến”.

Điều khiển: kéo để di chuyển, chạm vào ô đất để thao tác (góc nhìn và mức zoom cố định).
Chạm biển “Mở khóa” hoặc bất kỳ ô cỏ nào để mở đất.
Cài đặt (nút bánh răng): chất lượng Thấp/Vừa/Cao, âm thanh, hiện FPS, cài lên màn hình chính, tài khoản, chơi lại từ đầu.

**Chạy như app trên điện thoại (PWA):** thêm game vào màn hình chính (Android: Chrome → *Cài đặt ứng dụng*,
hoặc nút trong Cài đặt; iPhone/iPad: Safari → Chia sẻ → *Thêm vào MH chính*) thì game mở toàn màn hình, có
biểu tượng riêng, không thanh địa chỉ. Gồm `client/public/manifest.webmanifest`, `sw.js` (không cache gì, để
luôn chạy bản mới nhất), icon trong `public/icons/` và favicon (tạo lại từ ảnh `client/icon-source.png` bằng `node scripts/icons.mjs`; ảnh gốc không lên git) và các thẻ
`apple-mobile-web-app-*` trong `index.html`. Cần HTTPS (đã có trên nongtrai.io.vn).

## Backend

Server giữ quyền quyết định; client chỉ là bản sao để thao tác mượt:

1. Người chơi chạm → `store.ts` áp dụng ngay (hiệu ứng, xu, XP hiện tức thì).
2. `game/net/sync.ts` gửi hành động lên API theo đúng thứ tự. Các lần thu hoạch / gieo cùng loại liên tiếp
   (vd. “Thu tất cả”) được gộp thành một request.
3. Server kiểm tra lại bằng cùng luật chơi (`server/app/Game/FarmService.php`) và trả về **toàn bộ state**.
   Khi không còn hành động nào chờ gửi, client thay state của mình bằng state server.
4. Nếu server từ chối (vd. cây chưa chín theo đồng hồ server, không đủ xu, chưa đủ cấp), client hiện thông báo
   và quay về state server. Mất mạng thì giữ hàng đợi và thử lại (1s → 15s).

Thời gian trồng tính bằng đồng hồ server (ms); client bù lệch giờ qua `serverTime` trong mỗi phản hồi.
Thu hoạch được chấp nhận sớm tối đa 2 giây (`GAME_HARVEST_GRACE_MS`) để bù độ trễ mạng.

Số liệu kinh tế nằm ở **`shared/economy.json`**, được cả client (`config.ts`) và server (`app/Game/Economy.php`)
đọc, nên không bao giờ lệch nhau. Sửa giá / XP / thời gian chỉ cần sửa file này.

**Tài khoản:** lần đầu mở game, server tự tạo tài khoản khách (token Sanctum lưu ở máy). Trong Cài đặt → Tài khoản,
người chơi **đăng nhập Google** (giữ nông trại khách đang chơi) hoặc đặt email + mật khẩu; đăng nhập trên máy khác để chơi tiếp.
Server kiểm tra ID token của Google bằng khóa công khai của Google (`app/Auth/GoogleIdToken.php`); cấu hình ở DEPLOY.md.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/auth/guest` | Tạo tài khoản khách + nông trại mới, trả token |
| POST | `/auth/login` | `{email, password}` → token |
| POST | `/auth/google` | `{credential}` (ID token từ Google Sign-In) → token; nếu đang là khách thì giữ nông trại hiện tại |
| POST | `/auth/register` | (đã có token) gắn `{name, email, password}` cho tài khoản khách |
| POST | `/auth/logout` | Thu hồi token hiện tại |
| GET | `/me` | Thông tin người chơi |
| GET | `/farm` | State nông trại |
| POST | `/farm/plant` | `{tiles: number[], crop}` — gieo theo thứ tự đến khi hết xu |
| POST | `/farm/harvest` | `{tiles: number[]}` — thu các ô đã chín, bỏ qua ô chưa chín |
| GET | `/games/tables?game=caro` | Phòng game: bàn đang chờ + bàn chưa xong của mình |
| POST | `/games/tables` | `{game, stake}` mở bàn, giữ tiền cược (tối thiểu 100) |
| GET | `/games/tables/{id}` | Trạng thái bàn (client hỏi mỗi giây; kiểm tra hết giờ) |
| POST | `/games/tables/{id}/join` · `/bot` · `/cancel` · `/move {x,y}` · `/resign` | Vào bàn · chơi với máy · huỷ (hoàn tiền) · đánh · bỏ cuộc |
| GET/POST | `/games/tienlen` · `/games/tienlen/{id}` · `…/join` · `/leave` · `/start` · `/play {cards}` · `/pass` | Tiến lên |
| POST | `/farm/dig` | `{tiles: number[]}` — đào cây trên các ô (không hoàn tiền) |
| POST | `/farm/sell` | `{crop, qty}` |
| POST | `/farm/unlock` | Mở ô đất kế tiếp (kiểm tra cấp + xu) |
| POST | `/farm/reset` | Chơi lại từ đầu (không còn nút trong game) |
| POST | `/farm/upgrade` | `{kind: soil\|sprinkler}` nâng cấp |
| POST | `/farm/fertilize` | `{tiles}` bón phân cho cây đang lớn |
| POST | `/farm/orders/deliver` · `/farm/orders/skip` | `{id}` giao / đổi đơn hàng |
| POST | `/farm/quests/claim` · `/farm/login-reward` | `{index}` nhận thưởng nhiệm vụ · nhận quà đăng nhập |
| POST | `/farm/animals/buy` · `/farm/animals/collect` | `{type}` mua gà/bò · `{which?}` thu sản phẩm |
| GET | `/leaderboard/{coins\|level\|tiles\|wins\|winnings}` | Top 50 + hạng của mình |
| POST | `/farm/animals/feed` · `/farm/animals/water` · `/farm/dog` | `{which?}` cho ăn · `{type}` đổ nước · mua chó canh |
| POST | `/farm/machines/buy` · `/start` · `/collect` | `{machine}` xây máy · `{machine, output}` làm một mẻ · `{machine?}` thu hàng |
| GET | `/farm/news` | Nhật ký hàng xóm (đánh dấu đã đọc) |
| GET | `/neighbors` · `/neighbors/{id}` | Danh sách hàng xóm · nông trại của một người |
| POST | `/neighbors/{id}/steal` · `/help` | `{tile}` hái trộm · tưới giúp |

API nằm ở gốc domain (production: `https://api.nongtrai.io.vn/farm`…). Mọi API `/farm/*` trả `{ok, message, result, state, serverTime}`; bị từ chối thì HTTP 422 kèm `message` và `state`.
Giới hạn 300 request/phút mỗi người chơi, 20/phút cho đăng nhập / tạo khách.

Bảng dữ liệu: `users` (thêm `is_guest`, email/mật khẩu cho phép trống), `farms` (xu, cấp, XP, số ô, kho dạng JSON),
`plantings` (ô, cây, `planted_at` ms; duy nhất theo nông trại + ô), `personal_access_tokens` (Sanctum).

Kiểm thử: `cd server && php artisan test` (14 test API, gồm đăng nhập Google, trên database MySQL riêng `farm_empire_test`, tạo bằng
`mysql -uroot -e "create database farm_empire_test"`);
`cd client && node scripts/online.mjs` chạy thật qua trình duyệt với API (gieo, chặn thu hoạch gian lận, thu, tải lại từ server).

## Công nghệ

- React 18 + TypeScript + Vite 6 (UI dạng DOM phủ lên canvas)
- Babylon.js 8 (WebGL2): camera trực giao nhìn từ trên xuống; ô đất / cây là hình 2D trong một atlas, vẽ bằng
  thin instance gộp theo mảnh (tổng quan: gộp toàn nông trại); đảo / cảnh dùng PBR + bóng đổ
- Laravel 12 (PHP 8.4) + MySQL 8 + Sanctum (token API) — xem phần Backend.
  Capacitor được thêm khi đóng gói Android/iOS.

## Cấu trúc

```
.htaccess                (hosting) web chỉ thấy game/ và api/, chặn phần còn lại
game/                    bản build của game (commit sẵn), thư mục web của nongtrai.io.vn
api/                     thư mục public của Laravel, thư mục web của api.nongtrai.io.vn
deploy.sh                cập nhật trên server (composer, migrate, cache; hook sau git pull)
shared/economy.json      số liệu kinh tế dùng chung client + server
server/                  Laravel 12
  app/Game/Economy.php     đọc economy.json + công thức cấp / giá đất
  app/Game/FarmService.php luật chơi phía server (khóa dòng farm khi xử lý)
  app/Http/Controllers/    AuthController (khách / đăng ký / đăng nhập), FarmController
  routes/api.php, database/migrations/, tests/Feature/FarmApiTest.php
client/src/
  game/
    config.ts            cây trồng (từ economy.json), công thức cấp, preset chất lượng
    state/store.ts       luật chơi phía client (áp dụng ngay) + cache localStorage
    net/                 api.ts (fetch + token), sync.ts (hàng đợi, đối chiếu state server), clock.ts
    Game.ts              khởi tạo scene, ánh sáng, bóng, input, cầu nối sang UI
    assets/registry.ts   danh mục asset; GLB thay thế placeholder khi có
    render/
      sprites.ts         hình 2D (Canvas) ô đất / ô cỏ / 15 cây × 5 giai đoạn, gộp vào 1 atlas
      batch.ts           thin instance theo mảnh + toàn nông trại
      tiles.ts           ô đất / ô cỏ khóa + animation trồng / thu hoạch / mở khóa
      world.ts           đồng cỏ vô tận, viền lối đất từng mảnh, cây / bụi / hoa ở đất hoang, bướm
      kits.ts            mẫu bụi, hoa, cỏ, đá, cây, bướm dùng chung
      materials.ts       PBR stylized + plugin shader gió (lá / cỏ rung)
      fx.ts              hạt lấp lánh, lá bay, bụi
      camera.ts          camera trực giao nhìn thẳng xuống, kéo / zoom / pinch
    audio/sfx.ts         âm thanh tổng hợp WebAudio (tạm)
  ui/                    HUD, popup, nhãn bám ô đất, hiệu ứng bay về kho / thanh xu
scripts/shot.mjs, flow.mjs   chụp ảnh và chạy tự động cả chu trình (puppeteer-core + Chrome; dùng ?offline)
scripts/online.mjs           kiểm thử end-to-end với API thật
```

## Hiệu năng (đo trên desktop, Chrome headless)

- ~70–78 draw call mỗi khung hình (đã gồm pass bóng đổ). Cỏ, hoa, cây, đá dùng thin instances; cây trồng dùng instances.
- Khoảng 160 nghìn đỉnh trong scene. Mô hình lúa mì chín là nặng nhất, 20 nghìn đỉnh mỗi ô.
- Preset chất lượng điều chỉnh: độ phân giải render (pixel ratio 1 / 1,5 / 2), shadow map (512 / 1024 / 2048),
  mật độ cỏ và hoa, số hạt hiệu ứng, số bướm, MSAA. Không dùng hậu kỳ toàn màn hình.
  Màu được xử lý ngay trong shader vật liệu.
- **Chưa đo trên điện thoại thật.** Con số FPS trong ảnh chụp là giới hạn vsync của trình duyệt headless.

## Việc còn lại (sau khi phong cách được duyệt)

1. Thay placeholder bằng model GLB chính thức (xem ASSETS.md).
2. Chuyển sang deep import của Babylon để tree-shake. Bundle hiện nặng 1,33 MB gzip.
3. Nén texture (KTX2 / Basis) khi có texture thật, và nạp asset theo nhu cầu.
4. Đo FPS trên điện thoại tầm trung (Android / iOS) rồi tinh chỉnh preset. Với nông trại lớn cần thêm LOD
   cho cây trồng khi zoom xa (hiện tối đa ~2.900 đỉnh/ô).
5. Backend Laravel: API trồng / thu / bán / mở đất, Sanctum auth, MySQL.
