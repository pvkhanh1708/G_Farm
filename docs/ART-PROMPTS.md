# Vẽ hình nông trại bằng ChatGPT

Tài liệu này dùng để nhờ ChatGPT (công cụ tạo ảnh) vẽ ô đất, nền và 25 loại cây, rồi đưa vào game.
Tên file và thư mục: xem [client/src/assets/sprites/README.md](../client/src/assets/sprites/README.md).

Prompt viết bằng tiếng Anh vì mô hình vẽ hiểu tiếng Anh chính xác hơn. Phần giải thích bằng tiếng Việt.

---

## 0. Cách nhanh nhất: mỗi cây một tấm ảnh (31 lần vẽ)

ChatGPT chỉ vẽ một ảnh mỗi lần trả lời. Vì vậy mỗi lần vẽ **trọn một cây** trên một tấm 3×2 (5 giai đoạn + icon),
lưu thành `client/src/assets/sprites/crops/<mã>.png`; game tự cắt. Tổng cộng 25 tấm cây + 6 hình ô đất / nền (mục 4).

Prompt cho một cây (thay phần trong ngoặc vuông bằng một dòng ở bảng mục 5):

```text
Draw a game sprite sheet: a 3x2 grid of six equal square cells on a wide 1536x1024 canvas (each cell 512x512),
TRANSPARENT background, no grid lines, no borders, no text, no labels. Every item is centred inside its own cell
with empty space around it and never crosses into a neighbouring cell.

Subject: a [TÊN CÂY TIẾNG ANH] plant for a casual mobile farming game, seen STRAIGHT FROM ABOVE (top-down
orthographic, like a map; not isometric, no perspective). No soil tile and no ground under the plants.
Cells, left to right, top row then bottom row:
1. stage 0: two or three small dark-brown seed mounds with tiny [MÀU HẠT] seeds (small, ~30% of the cell)
2. stage 1: a tiny fresh green sprout with two round seed leaves (~30%)
3. stage 2: [GĐ 2] (~50%)
4. stage 3: [GĐ 3] (~65%)
5. stage 4, ripe: [GĐ 4] (~75%)
6. shop icon: the ripe [QUẢ / HOA] shown slightly from the side, glossy, ~85% of the cell

Style: polished casual mobile game art, hand-painted 2D cartoon, bright saturated colours, soft cel shading,
thin dark-brown outline, light from the top-left, soft contact shadow under each plant, bold shapes readable when small.
Keep exactly the same style as the previous sheets in this chat.
```

Cây đầu tiên ưng ý thì giữ cùng cuộc trò chuyện cho các cây sau (hoặc đính kèm tấm đó làm mẫu khi mở cuộc mới).

## 1. Quy trình

1. **Tạo bảng phong cách trước** (mục 3). Chọn ra 1 bảng ưng ý nhất và lưu lại: đây là “ảnh mẫu” cho mọi lần sau.
2. **Mỗi hình một lần yêu cầu, trong cùng một cuộc trò chuyện**, lần nào cũng **đính kèm ảnh mẫu** và mở đầu bằng
   *“Match the art style of the attached reference exactly.”* Đây là cách giữ cho 170 hình đồng đều.
3. Nếu ảnh trả về có nền trắng thay vì trong suốt: xóa nền bằng remove.bg (hoặc Photoshop / Photopea).
4. Thu về **512×512**, đặt tên đúng quy tắc, thả vào `client/src/assets/sprites/…`.
5. `cd client && npm run build`, commit, push. Mở game xem trên điện thoại.

**Nên làm thử trước:** 1 cây đủ 5 giai đoạn (ví dụ cà rốt) + `soil.png` + `grass-1.png` + 2 nền. Gắn vào game xem thực tế
rồi mới làm 24 cây còn lại.

**Bản quyền:** theo điều khoản của OpenAI, bạn sở hữu ảnh tạo ra và được dùng thương mại.
Không ghi tên game, studio hay thương hiệu nào vào prompt (ví dụ không viết “giống Liên Quân”).

---

## 2. Phong cách chung (dán vào đầu mọi prompt)

```text
Art style: polished casual mobile farming game, hand-painted 2D cartoon, bright saturated colours,
soft cel shading, thin dark-brown outline, gentle highlight on the top-left, soft contact shadow under objects.
Camera: straight top-down orthographic view (looking directly down from above), no perspective, no isometric angle.
Lighting from the top-left. Clean shapes that stay readable at small size. No text, no watermark, no border.
```

---

## 3. Bảng phong cách (làm 1 lần, chọn bản đẹp nhất)

```text
[Phong cách chung ở mục 2]

Create a style reference sheet on a plain light background, arranged in a neat grid, all seen straight from above:
- one square tilled soil farm plot (dark brown earth with a few small pebbles, rounded corners)
- one square wild grass plot (light green grass with a tiny flower)
- a carrot plant at 5 growth stages left to right: seed mound, tiny sprout, young leafy plant,
  bushy plant, ripe plant with orange carrot tops showing
- a ripe tomato plant, a ripe cabbage, a ripe sunflower head
Keep every element the same scale and style.
```

---

## 4. Mẫu prompt từng loại hình

Mở đầu mọi lần bằng: `Match the art style of the attached reference exactly.` rồi dán **phong cách chung** (mục 2), sau đó:

### Ô đất – `tiles/soil.png`

```text
A single square tilled soil farm plot seen straight from above, filling the whole square image edge to edge,
slightly rounded corners. Rich dark-brown earth, subtle furrows, a few small grey pebbles, a soft lighter rim on the
top-left edge and a darker rim on the bottom-right. Square 1:1, 512x512, transparent background outside the rounded corners.
```

### Ô cỏ chưa mở – `tiles/grass-1.png`, `grass-2.png`, `grass-3.png`

```text
A single square patch of wild grass seen straight from above, filling the whole square image edge to edge,
slightly rounded corners. Fresh light-green grass with short blades. [Biến thể 1: no flowers | 2: one tiny white
flower | 3: one tiny yellow flower]. Square 1:1, 512x512, transparent background outside the rounded corners.
```

### Nền đồng cỏ – `ground/meadow.png`

```text
Seamless tileable texture of a lush green meadow lawn seen straight from above, short grass with subtle variation,
a few tiny scattered flowers. Must tile perfectly with no visible seams when repeated. Even lighting, no shadows of
large objects. Square 1:1, 512x512.
```

### Nền đất của mảnh đã mở – `ground/plot.png`

```text
Seamless tileable texture of light sandy-beige tilled farm earth seen straight from above, fine speckles and a few
tiny pebbles, lighter than normal soil. Must tile perfectly with no visible seams. Even lighting. Square 1:1, 512x512.
```

### Cây trồng – `crops/<mã>/<mã>-<giai đoạn>.png`

```text
A single [TÊN CÂY TIẾNG ANH] plant at growth stage [SỐ]/4, seen straight from above, centred in a square image.
[MÔ TẢ GIAI ĐOẠN — lấy ở bảng mục 5].
No soil tile, no ground, only the plant with its soft contact shadow.
Square 1:1, 512x512, transparent background.
```

Hai giai đoạn đầu giống nhau cho mọi cây, có thể dùng mô tả chung:

- **Giai đoạn 0:** `two or three small dark-brown seed mounds with tiny [MÀU HẠT] seeds, very small, centred`
- **Giai đoạn 1:** `a tiny fresh green sprout with two round seed leaves, small, centred`

### Icon cây – `icons/<mã>.png`

```text
A single icon of a ripe [TÊN CÂY / QUẢ TIẾNG ANH] for a mobile game shop, slightly angled three-quarter view,
bold dark-brown outline, glossy highlight, centred and filling about 85% of the square.
Square 1:1, 512x512, transparent background.
```

(Icon không cần nhìn từ trên xuống; nếu không vẽ icon, game dùng icon vector sẵn có.)

---

## 5. Mô tả từng cây (giai đoạn 2 → 4, nhìn từ trên xuống)

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

### Ví dụ hoàn chỉnh (cà rốt chín – `crops/carrot/carrot-4.png`)

```text
Match the art style of the attached reference exactly.

Art style: polished casual mobile farming game, hand-painted 2D cartoon, bright saturated colours,
soft cel shading, thin dark-brown outline, gentle highlight on the top-left, soft contact shadow under objects.
Camera: straight top-down orthographic view (looking directly down from above), no perspective, no isometric angle.
Lighting from the top-left. Clean shapes that stay readable at small size. No text, no watermark, no border.

A single carrot plant at growth stage 4/4, seen straight from above, centred in a square image.
Three feathery leaf tufts with bright orange carrot shoulders peeking out of the ground.
No soil tile, no ground, only the plant with its soft contact shadow.
Square 1:1, 512x512, transparent background.
```

---

## 6. Mẹo

- Hình lệch phong cách: yêu cầu *“Redraw this to match the reference: same outline thickness, same colours, same shading.”*
- Vẽ nghiêng (isometric) thay vì từ trên xuống: nhấn mạnh *“camera looking straight down, flat top view, like a map”*.
- Cây quá to / quá nhỏ: *“make the plant fill about 70% of the square”* (giai đoạn 4) hoặc *“about 30%”* (giai đoạn 0–1).
- Giữ nguyên một cuộc trò chuyện cho cả bộ để ChatGPT nhớ phong cách; nếu bắt đầu cuộc mới, đính kèm lại ảnh mẫu.
