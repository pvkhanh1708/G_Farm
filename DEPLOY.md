# Triển khai lên Hostinger (Web Hosting + SSH)

Hosting không có Node.js nên game được build sẵn trên máy dev và commit vào `game/`;
server chỉ cần `php84`, `composer84`, MySQL và git.

Cả repo được clone thẳng vào thư mục web của game. Sau đó **chỉ cần `git pull`** là cả game lẫn API được cập nhật.

```
~/domains/api.nongtrai.io.vn/public_html/     ← thư mục web của nongtrai.io.vn = gốc repo
├── .htaccess        chỉ cho web thấy game/ và api/, chặn mọi thứ khác (mã nguồn, .env, .git…)
├── game/            bản build của game (đã build sẵn trong git, hosting không cần Node)
├── api/             thư mục web của api.nongtrai.io.vn (index.php của Laravel)
├── server/          mã Laravel + server/.env (không truy cập được từ web)
├── shared/          economy.json dùng chung game + API
└── client/          mã nguồn game (chỉ dùng trên máy dev)
```

| Domain | Thư mục web trong hPanel |
|---|---|
| `nongtrai.io.vn` | `~/domains/api.nongtrai.io.vn/public_html` (gốc repo) |
| `api.nongtrai.io.vn` | `~/domains/api.nongtrai.io.vn/public_html/api` |

> Đường dẫn trên lấy theo bạn mô tả. Nếu hPanel ghi khác (vd. `~/domains/nongtrai.io.vn/public_html`), cứ thay
> đúng đường dẫn đó vào các lệnh bên dưới. Điều kiện duy nhất: thư mục của API phải là thư mục con `api/`
> nằm trong thư mục web của game.

Đã kiểm tra bố cục này trên Apache (LiteSpeed của Hostinger đọc `.htaccess` giống Apache): game chạy ở `/`,
API chạy ở subdomain, còn `server/.env`, `.git/config`, `shared/`, `client/src/…`, `README.md`… đều trả 404.

---

## Cài đặt lần đầu

### 1. hPanel

1. **PHP:** Websites → Advanced → **PHP Configuration** → 8.4 (tối thiểu 8.2). Đây là PHP của **website**, khác với
   `php84` dùng qua SSH; hãy kiểm tra cả ở site của subdomain `api`.
2. **Subdomain:** Domains → **Subdomains** → `api.nongtrai.io.vn`, tick *Custom folder* → `public_html/api`.
3. **SSH:** Advanced → **SSH Access** → Enable.
4. **Database:** Databases → **Management** → tạo database + user (vd. `u123456789_nongtrai`). Ghi lại mật khẩu.
5. **SSL:** Security → **SSL** → cài SSL miễn phí cho **cả** `nongtrai.io.vn` và `api.nongtrai.io.vn`.

### 2. Đưa code lên

Clone repo vào `~/domains/api.nongtrai.io.vn/public_html` (gốc repo = thư mục web, xóa trang mặc định của Hostinger trước).
Các lệnh dưới đây chạy trong thư mục đó qua SSH.

### 3. Cấu hình API

```bash
cp server/.env.production.example server/.env
nano server/.env
```

Sửa các dòng:

```dotenv
DB_HOST=localhost                    # như hPanel ghi
DB_DATABASE=u123456789_nongtrai
DB_USERNAME=u123456789_nongtrai
DB_PASSWORD=mat_khau_database
CORS_ALLOWED_ORIGINS=https://nongtrai.io.vn,https://www.nongtrai.io.vn
```

Giữ nguyên `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://api.nongtrai.io.vn`.

### 4. Cài đặt + bật tự cập nhật

```bash
./deploy.sh --after-pull                          # composer84 install, migrate, cache
php84 server/artisan key:generate --force
./deploy.sh --after-pull                          # cache lại config có APP_KEY
./deploy.sh --install-hook                        # từ giờ `git pull` tự chạy phần cập nhật API
```

`deploy.sh` dùng `php84` và `composer84` (PHP 8.4 bạn đã cấu hình trên Hostinger).

### 5. Đăng nhập Google (không bắt buộc)

1. [Google Cloud Console](https://console.cloud.google.com/) → tạo project → **Google Auth Platform**
   (menu *APIs & Services → OAuth consent screen* cũng dẫn tới đây):
   - **Overview → Get started** (hoặc mục **Branding**): App name `Nông Trại`, email hỗ trợ, **Audience: External**,
     email liên hệ → Create.
   - **Audience** → *Publishing status* → **Publish app**. Để *Testing* thì chỉ các email trong danh sách test đăng nhập được.
     Game chỉ dùng email, tên, ảnh nên không cần Google duyệt. Mục **Data Access** không cần thêm gì.
2. **Clients → + Create client** → *Application type*: **Web application**.
   *Authorized JavaScript origins*: `https://nongtrai.io.vn`, `https://www.nongtrai.io.vn`
   (thêm `http://localhost:5173` nếu muốn thử ở máy dev). *Authorized redirect URIs*: để trống. Không cần *Client secret*.
3. Chép **Client ID** (dạng `1234…apps.googleusercontent.com`) vào **hai** chỗ:
   - `client/.env` → `VITE_GOOGLE_CLIENT_ID=...` (máy dev), rồi `npm run build` và commit `game/`;
   - `server/.env` trên server → `GOOGLE_CLIENT_ID=...`, rồi `./deploy.sh --after-pull`.

Chưa điền Client ID thì nút Google tự ẩn, đăng ký bằng email vẫn dùng được.

### 6. Kiểm tra

```bash
curl https://api.nongtrai.io.vn/up                                                  # 200
curl -X POST -H "Accept: application/json" https://api.nongtrai.io.vn/auth/guest    # trả về token
curl -o /dev/null -w "%{http_code}\n" https://nongtrai.io.vn/server/.env            # phải là 404
```

Mở **https://nongtrai.io.vn**: góc phải trên hiện **“Đã đồng bộ”** là xong.

---

## Cập nhật phiên bản mới

Sửa `client/` hoặc `shared/` thì chạy `cd client && npm run build` trên máy dev trước khi commit,
để thư mục `game/` có bản build mới (hosting không có Node).

`git pull` cập nhật game ngay (file trong `game/`), rồi hook tự chạy: `composer install` → `migrate` → cache.
Cuối cùng in ra phiên bản game / API đang chạy. Nếu quên build, nó cảnh báo
`!! game/ is older than client/ or shared/`.

Người chơi chỉ cần tải lại trang (`index.html` không bị cache, file JS có hash trong tên nên luôn đúng bản mới).
Không muốn dùng hook thì thay `git pull` bằng `./deploy.sh` (tự pull + cập nhật API).

---

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Game hiện “Ngoại tuyến” | API không truy cập được: `curl https://api.nongtrai.io.vn/up`; F12 → Console/Network xem lỗi |
| Console báo lỗi **CORS** | `CORS_ALLOWED_ORIGINS` thiếu đúng domain game (có `https://`, không `/` cuối) → sửa `server/.env` → `./deploy.sh --after-pull` |
| Console báo **Mixed Content** | Chưa bật SSL cho `api.nongtrai.io.vn` |
| Nút Google báo lỗi *origin not allowed* | Thêm đúng `https://nongtrai.io.vn` vào *Authorized JavaScript origins* |
| `api.nongtrai.io.vn` ra trang game hoặc 404 | Thư mục subdomain chưa phải `public_html/api` (hPanel → Subdomains) |
| API trả **500**, log/console có *Composer detected issues… PHP version* | PHP của website thấp hơn 8.2 → đổi PHP của site `api` trong hPanel |
| API trả **500** | Xem `server/storage/logs/laravel-*.log`. Hay gặp: thiếu `APP_KEY`, sai mật khẩu DB, quyền `storage/` |
| API trả **401** dù có token | Kiểm tra `api/.htaccess` còn dòng `HTTP_AUTHORIZATION` (có sẵn) |
| Sửa `server/.env` không có tác dụng | `./deploy.sh --after-pull` (cache lại config) |

## Sao lưu

Hostinger có sao lưu tự động (Files → Backups). Thêm bản sao lưu database mỗi ngày:
hPanel → Advanced → **Cron Jobs** → Custom, 3:00 hằng ngày:

```bash
mkdir -p ~/backups && mysqldump -u u123456789_nongtrai -p'MAT_KHAU' u123456789_nongtrai | gzip > ~/backups/nongtrai-$(date +\%F).sql.gz && find ~/backups -name 'nongtrai-*.sql.gz' -mtime +14 -delete
```
