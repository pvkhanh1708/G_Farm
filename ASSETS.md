# Farm Empire – Danh sách asset (Vertical Slice)

> **Tình trạng: toàn bộ asset hiện là placeholder thủ tục (procedural): hình 2D cho ô đất / cây, 3D cho đảo và cảnh.**
> Đồ họa **chưa hoàn thiện**. Đây là asset tạm, sinh bằng code để chốt phong cách,
> bố cục, animation và hiệu năng trước khi đầu tư vào model chính thức.

Không dùng asset, texture, model hay thương hiệu nào của Liên Quân Mobile / Garena / Tencent.
Phong cách chỉ dùng làm cảm hứng.

## Ô đất và cây trồng: hình 2D nhìn từ trên xuống

Nông trại nhìn thẳng từ trên xuống. Ô đất, ô cỏ và cây trồng là **hình 2D** vẽ bằng Canvas 2D lúc chạy
(`client/src/game/render/sprites.ts`) vào một atlas 2048 × 2048 dùng chung, mỗi hình một ô 160 × 160 px
(vùng vẽ 144 × 144 px, viền 8 px chống lem). Mỗi hình hiển thị bằng một mặt phẳng 4 đỉnh.

Thay bằng ảnh vẽ thật: thả PNG đúng tên vào `client/src/assets/sprites/` (quy tắc trong README ở thư mục đó), game tự dùng
ảnh đó; thiếu file nào thì giữ hình tạm. Prompt để nhờ ChatGPT vẽ: [docs/ART-PROMPTS.md](docs/ART-PROMPTS.md).

## Danh sách

Cột “Kích thước”: asset thủ tục không có file. Hình 2D: một ô 160 px trong atlas, hiển thị bằng 4 đỉnh. Cảnh 3D: số đỉnh của mesh sinh ra lúc chạy.

| ID | Asset | Nguồn | Giấy phép | Kích thước | Trạng thái |
|---|---|---|---|---|---|
| crop.carrot.s0–s4 | Cà rốt, 5 giai đoạn (3 củ / ô) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.wheat.s0–s4 | Lúa mì, 5 giai đoạn (7 khóm / ô) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.tomato.s0–s4 | Cà chua, 5 giai đoạn (1 bụi lớn / ô) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.strawberry.s0–s4 | Dâu tây, 5 giai đoạn (3 bụi / ô, hoa trắng, quả có hạt) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.cabbage.s0–s4 | Bắp cải, 5 giai đoạn (1 cây cuộn / ô) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.corn.s0–s4 | Ngô, 5 giai đoạn (3 thân / ô, cờ + bắp) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.eggplant.s0–s4 | Cà tím, 5 giai đoạn (1 bụi / ô, hoa tím, 4 quả) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.pumpkin.s0–s4 | Bí ngô, 5 giai đoạn (dây lá + 1 quả lớn) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.sunflower.s0–s4 | Hướng dương, 5 giai đoạn (mặt hoa nhìn từ trên) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.potato.s0–s4 | Khoai tây, 5 giai đoạn (bụi lá + củ trồi lên mặt đất) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.chili.s0–s4 | Ớt, 5 giai đoạn (bụi, hoa trắng, 8 quả cong) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.watermelon.s0–s4 | Dưa hấu, 5 giai đoạn (dây bò + quả sọc) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.pineapple.s0–s4 | Dứa, 5 giai đoạn (cụm lá gai + quả có vương miện) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.cotton.s0–s4 | Bông, 5 giai đoạn (2 bụi, quả nang nở bông trắng) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.lavender.s0–s4 | Oải hương, 5 giai đoạn (5 khóm, bông tím) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.tea.s0–s4 | Trà, 5 giai đoạn (4 bụi trà, hoa trắng) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.grape.s0–s4 | Nho, 5 giai đoạn (giàn + chùm nho tím) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.coffee.s0–s4 | Cà phê, 5 giai đoạn (cành lá bóng, quả đỏ) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.dragonfruit.s0–s4 | Thanh long, 5 giai đoạn (cành xương rồng, quả hồng) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.rose.s0–s4 | Hoa hồng, 5 giai đoạn (bụi, hoa đỏ nhiều lớp) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.durian.s0–s4 | Sầu riêng, 5 giai đoạn (lá lớn, quả gai) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.orchid.s0–s4 | Hoa lan, 5 giai đoạn (lá dày, cành hoa tím) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.ginseng.s0–s4 | Nhân sâm, 5 giai đoạn (lá chân vịt, chùm quả đỏ, củ) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.saffron.s0–s4 | Nghệ tây, 5 giai đoạn (lá kim, hoa tím nhụy đỏ) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| crop.cantaloupe.s0–s4 | Dưa lưới, 5 giai đoạn (dây lá, quả vân lưới) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px / giai đoạn | Placeholder |
| tile.soil | Ô đất nhìn từ trên (đất nâu, sỏi, viền bo) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px | Placeholder |
| tile.grass | Ô khóa nhìn từ trên (cỏ, 3 biến thể) | Code (`render/sprites.ts`) | Code của dự án | Ô atlas 160 px | Placeholder |
| env.island | Đảo nổi cho mỗi mảnh 4×4 (mặt cỏ + vách đất) | Code (`render/world.ts`) | Code của dự án | 1.369 + 505 đỉnh / đảo | Placeholder |
| env.bush / rock / flowers / grass | Bụi, đá, hoa, cỏ viền đảo (thin instances) | Code (`render/kits.ts`) | Code của dự án | 54–288 đỉnh mỗi mẫu | Placeholder |
| env.clouds | Mây trôi + đảo nhỏ có cây ở xa | Code (`render/world.ts`) | Code của dự án | vài nghìn đỉnh | Placeholder |
| env.butterfly | Bươm bướm | Code | Code của dự án | 4 đỉnh / cánh | Placeholder |
| tex.* | Texture cỏ, đất, gỗ, đường, nước, hạt sáng | Vẽ bằng Canvas lúc chạy (`render/textures.ts`) | Code của dự án | 64–512 px, không có file | Placeholder |
| ui.icons | Icon nông sản, xu, túi hạt, kho… | SVG viết tay (`src/ui/icons.tsx`) | Code của dự án | Nằm trong JS bundle | Bản demo dùng được |
| audio.sfx | Âm thanh thu hoạch, tiền xu, mở khóa, chim hót | Tổng hợp bằng WebAudio (`game/audio/sfx.ts`) | Code của dự án | Không có file | Placeholder |
| font | Baloo 2 | `@fontsource/baloo-2` (Google Fonts) | SIL Open Font License 1.1 (dùng thương mại được) | ~40 KB/weight woff2 (latin + latin-ext + vietnamese, tải theo unicode-range) | Đã tích hợp |
| engine | Babylon.js 8 | npm `@babylonjs/core` | Apache-2.0 | 6,1 MB min / 1,33 MB gzip (chưa tree-shake) | Đã tích hợp |

## Asset cần mua hoặc đặt làm cho bản hoàn thiện

Nguồn nên cân nhắc (cần kiểm tra lại giấy phép từng gói trước khi mua):
Quaternius và Kenney (CC0), Synty POLYGON Farm (giấy phép thương mại trả phí), hoặc thuê họa sĩ 3D làm riêng (khuyến nghị để có bộ nhận diện riêng).

- 3 loại cây × 5 giai đoạn (15 model), có hand-painted texture hoặc gradient atlas.
- Ô đất, ô cỏ khóa, đảo nổi, biển “Mở khóa”.
- Bộ trang trí: bụi, đá, hoa, mây, đảo nhỏ phía xa.
- Âm thanh thu, bán, mở khóa, nhạc nền. Nguồn: thu âm riêng, hoặc thư viện có giấy phép thương mại.
- Icon UI do họa sĩ vẽ lại theo bộ nhận diện chính thức.
