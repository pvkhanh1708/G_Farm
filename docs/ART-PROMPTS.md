# Vẽ hình cho Nông Trại Vui Vẻ

Tài liệu này dùng để nhờ công cụ tạo ảnh (ChatGPT…) vẽ bất kỳ hình nào cho game, cùng một phong cách với bộ
hình đang dùng: icon nút, đồ vật trong chuồng, con vật, nền đất, cây trồng.

Prompt viết bằng tiếng Anh vì mô hình vẽ hiểu tiếng Anh chính xác hơn. Phần giải thích bằng tiếng Việt.

---

## Prompt dùng cho mọi hình (chỉ cần thay 2 chỗ)

Muốn vẽ món gì trong tương lai: copy nguyên khối dưới, thay **`[ITEM]`** bằng mô tả món đó (tiếng Anh) và
**`[VIEW]`** bằng một trong ba dòng góc nhìn bên dưới. Đính kèm 1–2 hình đang có trong game làm mẫu nếu được.

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw [ITEM] as a single game asset for a cozy casual mobile farming game.

[VIEW]

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

Chọn một dòng cho **`[VIEW]`**:

| Loại hình | Dán vào `[VIEW]` | Lưu vào thư mục |
|---|---|---|
| Icon nút, vật phẩm trong kho (bánh, phô mai, hộp quà…) | `Slightly angled three-quarter front view, like a shop icon.` | `ui/` |
| Đồ vật đặt trong nông trại (nhà, máng, cây cảnh, máy móc…) | `Isometric three-quarter top-down view (camera above and in front, about 30 degrees down), standing on the ground with its base at the bottom of the image, no ground tile under it.` | `props/` |
| Nền lặp liền (đất, cỏ, sàn chuồng…) | `Seen from directly above as a seamless tileable ground texture that fills the whole square edge to edge, even lighting, no objects, no seams when repeated.` (bỏ dòng "one object only, centred") | `ground/` |

Ví dụ vẽ cái giếng nước để trang trí: `[ITEM]` = `a small stone water well with a wooden roof and a bucket`,
`[VIEW]` = dòng "Đồ vật đặt trong nông trại", lưu thành `props/well.png`.

Con vật (cần 12 tư thế) và cây trồng (5 giai đoạn) có khổ ảnh riêng: dùng mẫu C và E ở mục 3.

---

## 1. Cách dùng

1. Chọn đúng **mẫu prompt** theo loại hình (mục 3): icon, đồ vật, con vật, nền, cây.
2. Dán **khối phong cách chung** (mục 2) lên đầu, rồi đến mẫu prompt, thay phần `[TRONG NGOẶC]`.
3. Nếu có, **đính kèm 1–2 hình đã có trong game làm mẫu** (ví dụ `ui/coin.png`, `props/coop.png`) và mở đầu bằng
   *“Match the art style of the attached reference exactly.”* Đây là cách giữ cả bộ đồng đều.
4. Lưu PNG **nền trong suốt** (nền đen trong ảnh xem trước thường là trong suốt; nếu ra nền trắng thì xóa nền bằng
   remove.bg / Photopea).
5. Đặt **đúng tên, đúng thư mục** ở danh sách (mục 4) trong `client/src/assets/sprites/`. Không cần sửa code: game
   tự dùng ảnh nếu có, chưa có thì dùng hình vẽ tạm.
6. `cd client && npm run build` (script tự chuyển PNG sang WebP nhỏ), rồi commit + push.

Kích thước nên vẽ: **1024×1024** cho icon và đồ vật (ChatGPT vẽ khổ vuông này), **1536×1024** cho tấm cây,
khổ ngang cho tấm con vật. Không cần đúng tuyệt đối: script tự cắt sát hình và thu nhỏ.

---

## 2. Phong cách chung (dán vào đầu mọi prompt)

Rút ra từ các hình đã dùng (đồng xu, kho, nhà gà, máng ăn, ổ trứng, bò, gà…):

```text
Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow. Clean, bold shapes that stay readable
when shown very small on a phone. Single object only, centred, transparent background, no ground, no scenery,
no text, no letters, no numbers, no watermark, no frame, no border.
```

---

## 3. Mẫu prompt theo loại hình

### A. Icon nút / vật phẩm (thư mục `ui/`)

Dùng cho nút bên phải, nút dưới, xu, sao cấp, hàng chế biến… Hình nghiêng 3/4 nhẹ, đầy khung.

```text
[Phong cách chung]

A single game icon of [MÔ TẢ VẬT, VD: a wooden bakery oven with a loaf of bread], slightly angled
three-quarter view, the object fills about 85% of a square 1:1 canvas (1024x1024), centred,
transparent background.
```

### B. Đồ vật đặt trong cảnh (thư mục `props/`)

Nhà gà, máng ăn, máng nước, rơm, nhà chó… Nhìn **chéo từ trên xuống kiểu isometric** như cảnh game, đứng trên mặt đất.

```text
[Phong cách chung]

A single [MÔ TẢ VẬT, VD: small wooden dog house with a red roof] for a farm scene, seen from an isometric
three-quarter top-down angle (camera above and in front, about 30 degrees down), the object stands on
the ground with its base at the bottom of the image, fills about 85% of a square 1:1 canvas (1024x1024),
transparent background, no ground tile under it.
```

Đồ có **2 trạng thái** (đầy / cạn): vẽ lần lượt cùng một cuộc trò chuyện, lần 2 viết thêm
*“Exactly the same object, same angle and size, but [empty / without water].”*

### C. Con vật – tấm 12 tư thế (thư mục `animals/`)

```text
[Phong cách chung]

A sprite sheet of one cute [CON VẬT, VD: farm pig] for a farming game: a grid of 6 columns x 2 rows of
equal cells on a wide transparent canvas (2172x724), no grid lines. The same animal in every cell, same
size, all facing RIGHT, side view, standing on the bottom of its cell:
row 1: standing; happy with eyes closed; walking step 1; step 2; step 3; step 4 (a smooth walk cycle);
row 2: head down eating; calling with mouth open; three-quarter view turned toward the viewer;
seen from behind; (two extra poses of your choice).
```

### D. Nền lặp liền (thư mục `ground/`)

```text
[Phong cách chung, bỏ câu "Single object only…"]

A seamless tileable ground texture of [MÔ TẢ, VD: packed farmyard earth with scattered straw and small
pebbles], seen from above, even lighting, no large objects, no shadows of objects, must tile with no
visible seams. Square 1:1 (1024x1024).
```

### E. Cây trồng – tấm 3×2 (thư mục `crops/`)

Một tấm cho trọn một cây: 5 giai đoạn + icon cửa hàng. Mô tả từng giai đoạn: bảng ở mục 5.

```text
[Phong cách chung, bỏ câu "Single object only…"]

A game sprite sheet: a 3x2 grid of six equal square cells on a wide 1536x1024 transparent canvas (each cell
512x512), no grid lines. Every item centred in its own cell with empty space around it, never crossing into a
neighbouring cell. Subject: a [TÊN CÂY] plant, front three-quarter view, standing on a small soil mound.
1. stage 0: [MÀU HẠT] seeds in a small soil mound (~30% of the cell)
2. stage 1: a tiny green sprout with two round leaves (~30%)
3. stage 2: [GĐ 2] (~50%)
4. stage 3: [GĐ 3] (~65%)
5. stage 4, ripe: [GĐ 4] (~75%)
6. shop icon: the ripe [QUẢ / HOA], glossy, ~85% of the cell, no soil
```

### F. Bong bóng nhỏ trên đầu (thư mục `ui/`)

Hình đặt trong bong bóng tròn trắng; vẽ **đơn giản, ít chi tiết** vì hiện rất nhỏ. Dùng mẫu A, thêm
*“very simple, few details, readable at 40 pixels”*.

---

## 4. Danh sách cần vẽ

Các hình dưới đây **game đang dùng hình vẽ tạm bằng code**. Thả file đúng tên vào đúng thư mục là game tự thay.
“Cỡ vẽ” là khổ nên tạo; “Trong game” là cỡ hình hiện ra (để biết mức chi tiết cần có).

### 4.1 Icon giao diện – `ui/` (mẫu A, vẽ 1024×1024)

| Ưu tiên | File | Vẽ gì | Dùng ở đâu | Trong game |
|---|---|---|---|---|
| 1 | `ui/workshop.png` | xưởng chế biến nhỏ: nhà gỗ có ống khói, bánh răng | nút “Xưởng”, cửa sổ Xưởng | 30–34 px |
| 1 | `ui/neighbors.png` | hai ngôi nhà nông trại cạnh nhau | nút “Hàng xóm” | 30–34 px |
| 1 | `ui/dog.png` | mặt chú chó canh dễ thương, vòng cổ đỏ | Chó canh (Chuồng trại), nông trại có chó | 16–46 px |
| 1 | `ui/steal.png` | bàn tay đang hái / túi vải nhỏ đựng rau | nút hái trộm | 16–18 px |
| 1 | `ui/watering-can.png` | bình tưới cây đang tưới | nút tưới giúp | 16–18 px |
| 1 | `ui/feed-bowl.png` | bát gỗ trống có vài hạt thóc (đơn giản, mẫu F) | bong bóng “đói” trên đầu con vật | 40 px |
| 2 | `ui/flour.png` | bao bột mì vải có hình bông lúa | hàng chế biến, kho, đơn hàng | 18–44 px |
| 2 | `ui/bread.png` | ổ bánh mì vàng giòn | như trên | 18–44 px |
| 2 | `ui/cake.png` | bánh kem dâu có quả dâu trên đỉnh | như trên | 18–44 px |
| 2 | `ui/cheese.png` | miếng phô mai vàng có lỗ | như trên | 18–44 px |
| 2 | `ui/yogurt.png` | hũ sữa chua dâu màu hồng | như trên | 18–44 px |
| 3 | `ui/gift.png` | hộp quà đỏ nơ vàng | quà đăng nhập | 24–34 px |
| 3 | `ui/sprinkler.png` | máy tưới nước phun tia | nâng cấp Máy tưới | 44 px |
| 3 | `ui/fertilizer.png` | bao phân bón xanh có lá mầm | phân bón, nâng cấp Đất màu mỡ | 16–44 px |
| 3 | `ui/lock.png` | ổ khóa vàng | ô đất chưa mở, mục chưa đủ cấp | 16–64 px |
| 3 | `ui/clock.png` | đồng hồ báo thức tròn | thời gian chờ | 13–16 px |

### 4.2 Đồ vật trong cảnh – `props/` (mẫu B, vẽ 1024×1024)

| Ưu tiên | File | Vẽ gì | Trong game |
|---|---|---|---|
| 1 | `props/doghouse.png` | nhà chó gỗ mái đỏ, chú chó thò đầu ra cửa | ~110 px |

### 4.3 Đã có ảnh (không cần vẽ lại)

Kho, hạt giống, trồng, thu hoạch, xu, sao cấp, cúp, phòng game, cài đặt, nhiệm vụ, đơn hàng, nâng cấp, gà, bò,
trứng, sữa (icon); nhà gà, máng ăn / máng nước gà và bò (đầy + cạn), rơm, ổ trứng, bình sữa; gà, bò (12 tư thế);
nền đồng cỏ, nền đất, nền chuồng gà, chuồng bò; ô đất, 3 ô cỏ; 25 loại cây.

Nếu sau này thêm con vật mới (lợn, cừu…), cần: tấm 12 tư thế `animals/<con>.png` (mẫu C), icon `ui/<con>.png`,
sản phẩm (`ui/<sản phẩm>.png`), máng ăn / nước riêng nếu muốn (`props/<con>-feeder.png`, `-empty`,
`props/<con>-water.png`, `-empty`), nền chuồng `ground/pen-<con>.png` (mẫu D).

---

## 5. Mô tả từng cây (giai đoạn 2 → 4)

| Mã | Tên tiếng Anh | Màu hạt (gđ 0) | Gđ 2 – cây non | Gđ 3 – trưởng thành | Gđ 4 – chín |
|---|---|---|---|---|---|
| `carrot` | carrot | pale tan | a small tuft of feathery carrot leaves | a full fluffy tuft of feathery leaves | three feathery leaf tufts with bright orange carrot shoulders peeking out of the ground |
| `wheat` | wheat | golden | a few thin green grass-like blades | dense green stalks with green wheat ears | dense golden wheat with plump ripe golden ears |
| `tomato` | tomato | cream | a small leafy tomato seedling | a bushy tomato plant with small yellow flowers and green tomatoes | a bushy tomato plant covered with shiny ripe red tomatoes |
| `strawberry` | strawberry | pale yellow | a small rosette of three-lobed leaves | a low rosette with small white flowers | a low rosette of three-lobed leaves with several bright red strawberries |
| `potato` | potato | brown | a small leafy potato seedling | a bushy potato plant with small lilac flowers | a slightly yellowing potato plant with brown potatoes showing at its base |
| `cabbage` | cabbage | brown | a loose rosette of round blue-green leaves | a rosette forming a small pale-green head | a big round pale-green cabbage head wrapped in outer leaves |
| `corn` | corn | yellow | a star of long thin green leaves | tall corn leaves in a star with a tassel in the centre | corn leaves with two yellow corn cobs in green husks |
| `chili` | chili pepper | cream | a small leafy chili seedling | a bushy chili plant with white flowers and green chilies | a bushy chili plant with many glossy red chilies |
| `eggplant` | eggplant | cream | a few broad dark-green leaves | a leafy plant with purple star-shaped flowers | a leafy plant with three glossy dark-purple eggplants |
| `watermelon` | watermelon | black | young vines with a few round leaves | spreading vines with yellow flowers and a small striped melon | spreading vines with a big dark-green striped watermelon |
| `pumpkin` | pumpkin | white | young vines with a few round leaves | spreading vines with orange flowers and a small green pumpkin | spreading vines with a big ribbed orange pumpkin |
| `pineapple` | pineapple | brown | a small rosette of spiky leaves | a spiky rosette with a pink flower bud in the centre | a spiky rosette with a golden pineapple and its leafy crown |
| `cotton` | cotton | dark brown | two small leafy shrubs | two shrubs with cream flowers and green bolls | two shrubs with fluffy white open cotton bolls |
| `lavender` | lavender | dark | five small grey-green tufts | grey-green tufts with pale flower spikes | grey-green tufts with bright purple lavender flower spikes |
| `sunflower` | sunflower | dark | a few broad heart-shaped leaves | broad leaves around a closed green flower bud | a big open sunflower head with yellow petals and a brown seed centre |
| `tea` | tea | brown | four small round tea bushes | four clipped tea bushes with small white flowers | four clipped glossy tea bushes with fresh light-green tips |
| `grape` | grape | brown | young vines on a wooden trellis | vines on a trellis with small green grape bunches | vines on a trellis with big purple grape bunches |
| `coffee` | coffee | cream | small branches of glossy dark leaves | glossy coffee branches with small white flowers | glossy coffee branches with clusters of red coffee cherries |
| `dragonfruit` | dragon fruit | black | a few green cactus arms | a star of cactus arms with large white flowers | a star of cactus arms with bright pink dragon fruits |
| `rose` | rose | tan | a small leafy rose bush | a rose bush with closed red buds | a rose bush with several fully open red roses |
| `durian` | durian | tan | a few large leaves | large leaves around a small green spiky fruit | large leaves around a big spiky yellow-green durian |
| `orchid` | orchid | cream | a few thick glossy leaves | thick leaves with an arching stem of buds | thick leaves with an arching stem of purple-and-white orchid flowers |
| `ginseng` | ginseng | red | three stalks of five-leaflet leaves | five-leaflet leaves around a cluster of green berries | five-leaflet leaves around a cluster of bright red berries, a pale root visible |
| `saffron` | saffron crocus | tan | five small tufts of thin grass-like leaves | thin leaves with closed purple buds | thin leaves with open purple crocus flowers showing red stigmas |
| `cantaloupe` | cantaloupe melon | cream | young vines with a few round leaves | vines with yellow flowers and a small green melon | vines with two big netted beige cantaloupe melons |

## 6. Mẹo

- Hình lệch phong cách: *"Redraw this to match the reference: same outline thickness, same colours, same shading."*
- Đồ vật bị vẽ thẳng mặt: nhấn mạnh *"isometric three-quarter top-down angle, like a farm building in a mobile farming game"*.
- Hình quá nhỏ trong khung: *"make the object fill about 85% of the square"*.
- Giữ một cuộc trò chuyện cho cả bộ để công cụ nhớ phong cách; mở cuộc mới thì đính kèm lại ảnh mẫu.
- Bản quyền: theo điều khoản của OpenAI, bạn sở hữu ảnh tạo ra. Không ghi tên game / thương hiệu khác vào prompt.

## 7. Prompt sẵn cho danh sách cần vẽ

Copy nguyên từng khối, đính kèm các hình mẫu ghi ở mỗi mục (trong `client/src/assets/sprites/`), lưu kết quả
đúng tên file. Thứ tự: ưu tiên 1 → 3.

### 1. Xưởng chế biến → `ui/workshop.png` (ưu tiên 1)

Hình mẫu đính kèm: `ui/barn.png, ui/upgrade.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a small cozy wooden workshop building with a red tiled roof, a stone chimney puffing a little white smoke and a big golden cog wheel on its front wall as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 2. Hàng xóm → `ui/neighbors.png` (ưu tiên 1)

Hình mẫu đính kèm: `ui/barn.png, ui/game-room.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw two small cute farmhouses side by side, one with a red roof and one with a green roof, a short wooden fence and a tiny path between them as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 3. Chó canh → `ui/dog.png` (ưu tiên 1)

Hình mẫu đính kèm: `ui/chicken.png, ui/cow.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw the head of a friendly brown-and-cream farm guard dog with floppy ears, big shiny eyes, a happy open mouth and a red collar with a small golden tag as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.
Same framing as the chicken and cow face icons attached: head only, facing the viewer.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 4. Hái trộm → `ui/steal.png` (ưu tiên 1)

Hình mẫu đính kèm: `ui/harvest.png, ui/seeds.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a small burlap sack bulging with fresh vegetables (a carrot, a tomato and leafy greens poking out of the top) with a cartoon hand grabbing it as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 5. Tưới giúp → `ui/watering-can.png` (ưu tiên 1)

Hình mẫu đính kèm: `ui/harvest.png, ui/plant.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a cute green metal watering can tilted forward, pouring a stream of blue water drops from its spout as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 6. Bát ăn (bong bóng "đói") → `ui/feed-bowl.png` (ưu tiên 1)

Hình mẫu đính kèm: `props/chicken-feeder-empty.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a small empty round wooden feeding bowl with only a few golden grains left at the bottom as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.
Very simple, few details, thick outline: it is shown about 40 pixels wide inside a speech bubble.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 7. Nhà chó (trong cảnh) → `props/doghouse.png` (ưu tiên 1)

Hình mẫu đính kèm: `props/coop.png, props/hay.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a small wooden dog house with a red tiled roof and an arched doorway, a cute brown-and-cream dog peeking its head out of the door, a little food bowl beside it as a single game asset for a cozy casual mobile farming game.

Isometric three-quarter top-down view (camera above and in front, about 30 degrees down), standing on the ground with its base at the bottom of the image, no ground tile under it.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 8. Bột mì → `ui/flour.png` (ưu tiên 2)

Hình mẫu đính kèm: `ui/seeds.png, ui/milk.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a plump cloth sack of white flour tied with string at the top, a golden wheat ear printed on the front and a little flour dust around the opening as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 9. Bánh mì → `ui/bread.png` (ưu tiên 2)

Hình mẫu đính kèm: `ui/egg.png, ui/milk.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a freshly baked golden-brown loaf of bread with a crispy crust and three diagonal score marks on top as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 10. Bánh dâu → `ui/cake.png` (ưu tiên 2)

Hình mẫu đính kèm: `ui/egg.png, ui/milk.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a round strawberry cream cake with pink frosting, white cream swirls and a big glossy strawberry on top, on a small white plate as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 11. Phô mai → `ui/cheese.png` (ưu tiên 2)

Hình mẫu đính kèm: `ui/egg.png, ui/milk.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a thick wedge of yellow cheese with round holes, a soft highlight on its top face as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 12. Sữa chua dâu → `ui/yogurt.png` (ưu tiên 2)

Hình mẫu đính kèm: `ui/egg.png, ui/milk.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a small glass jar of pink strawberry yogurt with a red-and-white checkered cloth lid tied with a ribbon and a strawberry beside it as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 13. Quà đăng nhập → `ui/gift.png` (ưu tiên 3)

Hình mẫu đính kèm: `ui/coin.png, ui/quests.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a red gift box with a big shiny golden ribbon bow on top, the lid slightly lifted with golden sparkles coming out as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 14. Máy tưới → `ui/sprinkler.png` (ưu tiên 3)

Hình mẫu đính kèm: `ui/upgrade.png, ui/plant.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a garden water sprinkler on a small stand spraying arcs of sparkling blue water in a fan shape as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 15. Phân bón → `ui/fertilizer.png` (ưu tiên 3)

Hình mẫu đính kèm: `ui/seeds.png, ui/plant.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a green bag of plant fertilizer with a white sprout leaf symbol on the front, the top folded open with dark rich granules showing as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 16. Khóa → `ui/lock.png` (ưu tiên 3)

Hình mẫu đính kèm: `ui/coin.png, ui/settings.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a chunky golden padlock with a rounded shackle and a keyhole as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```

### 17. Đồng hồ → `ui/clock.png` (ưu tiên 3)

Hình mẫu đính kèm: `ui/coin.png, ui/settings.png`

```text
Match the art style of the attached reference images exactly (if any are attached).

Draw a round red alarm clock with two bells on top and a white face with simple hands as a single game asset for a cozy casual mobile farming game.

Slightly angled three-quarter front view, like a shop icon.
Very simple, few details: it is shown only about 16 pixels wide.

Art style: polished casual mobile farming game asset, hand-painted 2D cartoon with a soft 3D feel,
bright warm saturated colours, soft cel shading with smooth gradients, glossy highlights on the top-left,
thick dark-brown outline (#5a3214) around the whole silhouette and main shapes, chunky rounded friendly
proportions, warm sunny lighting from the top-left, subtle soft shadow.
Clean, bold shapes that stay readable when shown very small on a phone screen.

Output: one object only, centred, filling about 85% of a square 1:1 canvas (1024x1024),
TRANSPARENT background, no ground, no scenery, no text, no letters, no numbers, no watermark,
no frame, no border.
```
