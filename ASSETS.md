# Farm Empire – Danh sách asset (Vertical Slice)

> **Tình trạng: toàn bộ asset 3D hiện là placeholder thủ tục (procedural).**
> Đồ họa **chưa hoàn thiện**. Đây là asset tạm, sinh bằng code để chốt phong cách,
> bố cục, animation và hiệu năng trước khi đầu tư vào model chính thức.

Không dùng asset, texture, model hay thương hiệu nào của Liên Quân Mobile / Garena / Tencent.
Phong cách chỉ dùng làm cảm hứng.

## Cách thay asset tạm bằng model thật

1. Đặt file `.glb` vào `client/public/assets/models/`.
2. Trong `client/src/game/assets/registry.ts`, gán `glb: 'assets/models/<tên>.glb'` cho entry tương ứng và đổi `status` sang `'integrated'`.
3. Khi khởi động, `preloadAssets()` nạp GLB. Nếu nạp lỗi thì tự động quay về bản thủ tục.
   Hiện cây trồng (`crop.*`) đã dùng cơ chế này. Môi trường dùng chung cơ chế, chỉ cần nối thêm khi có model.

Quy ước cho model cây trồng: gốc tọa độ ở tâm ô đất, y = 0 tại mặt đất, ô đất 1,8 × 1,8 đơn vị.
Mỗi giai đoạn là một file. Nên dùng vertex color hoặc một atlas texture dùng chung để giữ ít draw call.

## Danh sách

Cột “Kích thước”: asset thủ tục không có file. Con số là số đỉnh (vertex) của mesh sinh ra lúc chạy.

| ID | Asset | Nguồn | Giấy phép | Kích thước | Trạng thái |
|---|---|---|---|---|---|
| crop.carrot.s0–s4 | Cà rốt, 5 giai đoạn | Code (`render/crops.ts`) | Code của dự án | 351 – 14.337 đỉnh / ô | Placeholder |
| crop.wheat.s0–s4 | Lúa mì, 5 giai đoạn | Code (`render/crops.ts`) | Code của dự án | 756 – 20.412 đỉnh / ô | Placeholder |
| crop.tomato.s0–s4 | Cà chua, 5 giai đoạn | Code (`render/crops.ts`) | Code của dự án | 234 – 8.526 đỉnh / ô | Placeholder |
| plot.frame | Khung gỗ ô đất | Code (`render/plots.ts`) | Code của dự án | 192 đỉnh | Placeholder |
| plot.soil | Đất có luống / rãnh | Code (`render/plots.ts`) | Code của dự án | 1.705 đỉnh | Placeholder |
| plot.cover | Cỏ / bụi phủ ô khóa (3 biến thể) | Code (`render/plots.ts`) | Code của dự án | ~1.660 đỉnh | Placeholder |
| env.tree.* | Cây tròn, cây có quả, cây hoa hồng, cây thông | Code (`render/environment.ts`) | Code của dự án | 123–252 đỉnh tán (thin instances) | Placeholder |
| env.bush | Bụi cây (4 biến thể) | Code | Code của dự án | ~168 đỉnh | Placeholder |
| env.rock | Đá | Code | Code của dự án | 54 đỉnh | Placeholder |
| env.flowers | Cụm hoa (5 màu) | Code | Code của dự án | 288 đỉnh | Placeholder |
| env.grass | Bụi cỏ | Code | Code của dự án | 135 đỉnh × 700–3.600 instance | Placeholder |
| env.barn | Nhà kho | Code | Code của dự án | 629 đỉnh | Placeholder |
| env.windmill | Cối xay gió (cánh quay) | Code | Code của dự án | 752 đỉnh | Placeholder |
| env.pond | Hồ nước, lá súng, sậy | Code (`render/terrain.ts`) | Code của dự án | ~2.200 đỉnh | Placeholder |
| env.props | Rơm, thùng gỗ, biển, máng nước | Code | Code của dự án | 402 đỉnh | Placeholder |
| env.butterfly | Bươm bướm | Code | Code của dự án | 4 đỉnh / cánh | Placeholder |
| terrain | Địa hình đồi | Code | Code của dự án | 22.801 đỉnh | Placeholder |
| tex.* | Texture cỏ, đất, gỗ, đường, nước, hạt sáng | Vẽ bằng Canvas lúc chạy (`render/textures.ts`) | Code của dự án | 64–512 px, không có file | Placeholder |
| ui.icons | Icon nông sản, xu, túi hạt, kho… | SVG viết tay (`src/ui/icons.tsx`) | Code của dự án | Nằm trong JS bundle | Bản demo dùng được |
| audio.sfx | Âm thanh thu hoạch, tiền xu, mở khóa, chim hót | Tổng hợp bằng WebAudio (`game/audio/sfx.ts`) | Code của dự án | Không có file | Placeholder |
| font | Baloo 2 | `@fontsource/baloo-2` (Google Fonts) | SIL Open Font License 1.1 (dùng thương mại được) | ~40 KB/weight woff2 (latin + latin-ext + vietnamese, tải theo unicode-range) | Đã tích hợp |
| engine | Babylon.js 8 | npm `@babylonjs/core` | Apache-2.0 | 6,1 MB min / 1,33 MB gzip (chưa tree-shake) | Đã tích hợp |

## Asset cần mua hoặc đặt làm cho bản hoàn thiện

Nguồn nên cân nhắc (cần kiểm tra lại giấy phép từng gói trước khi mua):
Quaternius và Kenney (CC0), Synty POLYGON Farm (giấy phép thương mại trả phí), hoặc thuê họa sĩ 3D làm riêng (khuyến nghị để có bộ nhận diện riêng).

- 3 loại cây × 5 giai đoạn (15 model), có hand-painted texture hoặc gradient atlas.
- Ô đất: khung, đất, hiệu ứng mở khóa.
- Bộ môi trường: 4–6 loại cây, bụi, đá, hoa, hàng rào, nhà kho, cối xay.
- Âm thanh thu, bán, mở khóa, nhạc nền. Nguồn: thu âm riêng, hoặc thư viện có giấy phép thương mại.
- Icon UI do họa sĩ vẽ lại theo bộ nhận diện chính thức.
