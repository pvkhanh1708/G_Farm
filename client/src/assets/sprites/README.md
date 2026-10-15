# Ảnh vẽ tay cho nông trại

Thả file PNG đúng tên vào đúng thư mục dưới đây: game tự dùng ảnh đó thay cho hình tạm.
Thiếu file nào thì game vẫn dùng hình tạm cho file đó, nên có thể thêm dần từng ảnh.

Ảnh gốc (PNG, thường ~2 MB/ảnh) **không đưa lên git**: `npm run art` tự tạo bản `.webp` nhỏ cùng tên bên cạnh
(ô 256 px, nền 512 px, tấm cây 768×512; tổng cỡ 2 MB cho cả bộ) và game chỉ dùng bản `.webp`.
Script chạy tự động trước `npm run dev` / `npm run build` (cần Chrome trên máy). Ảnh gốc giữ nguyên, nên tự sao lưu.

Sau khi thêm hoặc sửa ảnh: `cd client && npm run build`, commit (các file `.webp` và `game/`) rồi push.

Cách vẽ (prompt cho ChatGPT): xem [docs/ART-PROMPTS.md](../../../../docs/ART-PROMPTS.md).

## Cấu trúc thư mục

```
client/src/assets/sprites/
├── tiles/
│   ├── soil.png            ô đất đã cày (trồng được)
│   ├── grass-1.png         ô cỏ chưa mở, biến thể 1
│   ├── grass-2.png         biến thể 2
│   └── grass-3.png         biến thể 3
├── ground/
│   ├── meadow.png          nền đồng cỏ xung quanh (texture lặp liền mạch)
│   └── plot.png            nền đất nhạt của mảnh đã mở (texture lặp liền mạch)
├── crops/
│   ├── carrot/
│   │   ├── carrot-0.png    giai đoạn 0: vừa gieo hạt
│   │   ├── carrot-1.png    giai đoạn 1: nảy mầm
│   │   ├── carrot-2.png    giai đoạn 2: cây non
│   │   ├── carrot-3.png    giai đoạn 3: ra hoa / quả xanh
│   │   └── carrot-4.png    giai đoạn 4: chín, thu hoạch được
│   ├── wheat/
│   │   └── wheat-0.png … wheat-4.png
│   └── … (mỗi cây một thư mục, tên = mã cây)
├── icons/
│   ├── carrot.png          icon cây trong cửa hàng / kho
│   └── …
└── ui/                     icon giao diện (thay icon vẽ bằng code)
    ├── barn.png            Kho          ├── coin.png        xu
    ├── seeds.png           Hạt giống    ├── level-star.png  sao cấp độ / XP
    ├── plant.png           Trồng        ├── trophy.png      Xếp hạng
    ├── harvest.png         Thu hoạch + bong bóng cây chín    ├── game-room.png   Phòng game
    ├── settings.png        Cài đặt      ├── egg.png, milk.png  trứng, sữa
    ├── quests.png, orders.png, upgrade.png  Nhiệm vụ, Đơn hàng, Nâng cấp
    └── chicken.png, cow.png  gà, bò (nút Chuồng, cửa sổ Chuồng trại)
```

animals/chicken.png, animals/cow.png: lưới 6 cột × 2 hàng tư thế, quay sang phải, theo thứ tự
hàng 1: đứng · vui (nhắm mắt) · bước 1 · bước 2 · bước 3 · bước 4;
hàng 2: cúi mổ/gặm cỏ · kêu · 3/4 hướng về người xem · quay lưng · (2 ô cuối chưa dùng).
Script tự tách thành animals/<con>/frame-0..11.webp (bỏ chấm nhiễu quanh hình, cùng tỉ lệ, chân chạm đáy).

## Cách nhanh: mỗi cây một tấm ảnh

Thay vì 5 file riêng, có thể đặt **một tấm** `crops/<mã>.png` (ví dụ `crops/carrot.png`), lưới **3 cột × 2 hàng** ô bằng nhau
(ChatGPT: khổ ngang 1536×1024, mỗi ô 512×512):

```
┌──────────┬──────────┬──────────┐
│ gđ 0     │ gđ 1     │ gđ 2     │
│ hạt      │ mầm      │ cây non  │
├──────────┼──────────┼──────────┤
│ gđ 3     │ gđ 4     │ icon     │
│ ra hoa   │ chín     │ cửa hàng │
└──────────┴──────────┴──────────┘
```

Game tự tách tấm này: `npm run art` tìm từng cây theo hình dạng (không cắt theo ô vuông), nên cây vẽ tràn ra ngoài ô vẫn
được giữ nguyên, và tạo `crops/<mã>/stage-0..4.webp` + `icons/<mã>.webp`. Nếu có cả file lẻ (`crops/carrot/carrot-4.png`, `icons/carrot.png`) thì file lẻ được ưu tiên.

## Quy tắc đặt tên

- Chỉ chữ thường không dấu, số và dấu gạch ngang. Đuôi `.png` viết thường.
- Thư mục cây và tên file dùng **mã cây** ở bảng dưới, không dùng tên tiếng Việt.
- Giai đoạn đánh số **0 → 4** sau dấu gạch ngang: `<mã>-<giai đoạn>.png`.
- Sai tên một ký tự là game không nhận (vẫn dùng hình tạm), nên chép tên từ bảng dưới.

| Mã cây | Tên | Mã cây | Tên |
|---|---|---|---|
| `carrot` | Cà rốt | `pineapple` | Dứa |
| `wheat` | Lúa mì | `cotton` | Bông |
| `tomato` | Cà chua | `lavender` | Oải hương |
| `strawberry` | Dâu tây | `sunflower` | Hướng dương |
| `potato` | Khoai tây | `tea` | Trà |
| `cabbage` | Bắp cải | `grape` | Nho |
| `corn` | Ngô | `coffee` | Cà phê |
| `chili` | Ớt | `dragonfruit` | Thanh long |
| `eggplant` | Cà tím | `rose` | Hoa hồng |
| `watermelon` | Dưa hấu | `durian` | Sầu riêng |
| `pumpkin` | Bí ngô | `orchid` | Hoa lan |
| | | `ginseng` | Nhân sâm |
| | | `saffron` | Nghệ tây |
| | | `cantaloupe` | Dưa lưới |

## Yêu cầu kỹ thuật

| Loại | Kích thước | Nền | Ghi chú |
|---|---|---|---|
| `crops/…`, `tiles/…`, `icons/…` | vuông, **512×512** (tối thiểu 256×256) | **trong suốt** | nhìn thẳng từ trên xuống; nội dung nằm giữa, chừa ~4% lề |
| `ground/meadow.png`, `ground/plot.png` | vuông, **512×512** | không trong suốt | **lặp liền mạch** (ghép 4 bản cạnh nhau không thấy đường nối) |

- Ô đất `soil.png` và ô cỏ `grass-*.png` phủ **kín cả khung** (bo góc nhẹ), vì mỗi ô chiếm trọn một ô lưới.
- Hình cây vẽ **không có ô đất phía dưới** (nền trong suốt): game đặt cây lên ô đất `soil.png`.
- Cây ở giai đoạn chín có thể to gần kín khung; giai đoạn 0–1 nhỏ ở giữa.
- Game thu ảnh về 176×176 px trong atlas, nên vẽ nét rõ, đậm, ít chi tiết li ti.
- Giữ dung lượng mỗi file dưới ~300 KB (nén bằng TinyPNG nếu cần).
