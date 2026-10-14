# Farm Empire – Vertical Slice (Bước 1: đồ họa 3D)

Bản thử nghiệm chất lượng hình ảnh và cảm giác chơi trước khi làm gameplay đầy đủ.
Phạm vi: 1 bản đồ nông trại 3D, 3 loại cây × 5 giai đoạn, và chu trình
trồng → thu hoạch → bán → mở rộng đất, chạy trực tiếp trên trình duyệt.

Bố cục theo kiểu đảo nổi: mỗi **mảnh đất** là một đảo cỏ với lưới **4×4 ô** vuông. Ô mở theo thứ tự
(ô kế tiếp có biển “Mở khóa”); mở hết 16 ô thì mảnh kế tiếp xuất hiện. Các mảnh xếp theo vòng xoắn quanh
mảnh đầu tiên, số mảnh không giới hạn. Mỗi ô mở thêm đắt hơn ô trước 9%. Có nút “Trồng tất cả”, “Thu tất cả”,
và nút kính lúp để zoom ra xem tổng quan mọi mảnh đất.

> Đồ họa **chưa hoàn thiện**: mọi model 3D đều là placeholder thủ tục. Xem [ASSETS.md](ASSETS.md).
> Ảnh chụp màn hình nằm trong [docs/screenshots/](docs/screenshots/).

## Chạy thử

```bash
cd client
npm install
npm run dev          # http://localhost:5173  (thêm ?showcase để xem 3 cây × 5 giai đoạn)
npm run build        # bản production -> client/dist
npm run preview      # chạy thử bản production tại http://localhost:4173
```

Điều khiển: kéo để di chuyển camera, cuộn chuột hoặc chụm 2 ngón để zoom, chạm vào ô đất để thao tác.
Cài đặt (nút bánh răng): chất lượng Thấp/Vừa/Cao, âm thanh, hiện FPS, chơi lại từ đầu.

## Công nghệ

- React 18 + TypeScript + Vite 6 (UI dạng DOM phủ lên canvas)
- Babylon.js 8 (WebGL2): PBR, directional light + shadow map (PCF), thin instances, particle system
- Chưa có backend ở bước này. Logic game nằm trong `src/game/state/store.ts`, tách khỏi phần render,
  để sau này chuyển sang Laravel 12 + MySQL 8 + Sanctum (server giữ quyền quyết định, client làm cache).
  Capacitor được thêm khi đóng gói Android/iOS.

## Cấu trúc

```
client/src/
  game/
    config.ts            cây trồng, giá, preset chất lượng
    state/store.ts       luật chơi thuần (trồng, thu, bán, mở đất) + lưu localStorage
    Game.ts              khởi tạo scene, ánh sáng, bóng, input, cầu nối sang UI
    assets/registry.ts   danh mục asset; GLB thay thế placeholder khi có
    render/
      crops.ts           model cây thủ tục theo giai đoạn (instanced)
      tiles.ts           ô đất / ô cỏ khóa + animation trồng / thu hoạch / mở khóa
      world.ts           đảo nổi theo mảnh, mây, đảo xa, bướm
      kits.ts            mẫu bụi, hoa, cỏ, đá, cây, bướm dùng chung
      materials.ts       PBR stylized + plugin shader gió (lá / cỏ rung)
      fx.ts              hạt lấp lánh, lá bay, bụi
      camera.ts          camera isometric cố định góc 40°, kéo / zoom / pinch
    audio/sfx.ts         âm thanh tổng hợp WebAudio (tạm)
  ui/                    HUD, popup, nhãn bám ô đất, hiệu ứng bay về kho / thanh xu
scripts/shot.mjs, flow.mjs   chụp ảnh và chạy tự động cả chu trình (puppeteer-core + Chrome)
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
