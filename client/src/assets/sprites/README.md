# Ảnh vẽ tay cho nông trại

Thả file PNG đúng tên vào đúng thư mục dưới đây: game tự dùng ảnh đó thay cho hình tạm.
Thiếu file nào thì game vẫn dùng hình tạm cho file đó, nên có thể thêm dần từng ảnh.
Sau khi thêm ảnh: `cd client && npm run build`, commit cả `game/` rồi push.

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
└── icons/
    ├── carrot.png          icon cây trong cửa hàng / kho
    └── …
```

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
