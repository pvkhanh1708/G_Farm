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

1. **PHP 8.4:** Websites → Advanced → **PHP Configuration** → 8.4 (cho cả domain chính và subdomain `api`).
2. **Subdomain:** Domains → **Subdomains** → `api.nongtrai.io.vn`, tick *Custom folder* → `public_html/api`.
3. **SSH:** Advanced → **SSH Access** → Enable. Ghi lại IP, port (thường **65002**), username (`u123456789`).
4. **Database:** Databases → **Management** → tạo database + user (vd. `u123456789_nongtrai`). Ghi lại mật khẩu.
5. **SSL:** Security → **SSL** → cài SSL miễn phí cho **cả** `nongtrai.io.vn` và `api.nongtrai.io.vn`.

### 2. Clone repo vào thư mục web

```bash
ssh -p 65002 u123456789@IP_SERVER

# deploy key cho repo private
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

GitHub → repo **G_Farm** → Settings → **Deploy keys** → *Add deploy key* → dán khóa trên (không cần quyền ghi).

```bash
cd ~/domains/api.nongtrai.io.vn/public_html
ls -A                       # xem có gì: thường là default.php của Hostinger, có thể có thư mục api/ trống
rm -rf ./* ./.[!.]*         # git clone cần thư mục rỗng — chỉ chạy khi chắc chắn không còn gì cần giữ
git clone git@github.com:pvkhanh1708/G_Farm.git .
```

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

### 5. Kiểm tra

```bash
curl https://api.nongtrai.io.vn/up                                                  # 200
curl -X POST -H "Accept: application/json" https://api.nongtrai.io.vn/auth/guest    # trả về token
curl -o /dev/null -w "%{http_code}\n" https://nongtrai.io.vn/server/.env            # phải là 404
```

Mở **https://nongtrai.io.vn**: góc phải trên hiện **“Đã đồng bộ”** là xong.

---

## Cập nhật phiên bản mới

**Trên máy dev:**

```bash
cd client && npm run build        # chỉ cần khi sửa client/ hoặc shared/ — ghi bản build vào game/
cd .. && git add -A && git commit -m "..." && git push
```

**Trên server:**

```bash
cd ~/domains/api.nongtrai.io.vn/public_html && git pull
```

`git pull` cập nhật game ngay (file trong `game/`), rồi hook tự chạy: `composer install` → `migrate` → cache.
Cuối cùng in ra phiên bản game / API đang chạy. Nếu bạn quên build, nó cảnh báo:
`!! game/ is older than client/ or shared/` → build, commit, push rồi `git pull` lại.

Người chơi chỉ cần tải lại trang (`index.html` không bị cache, file JS có hash trong tên nên luôn đúng bản mới).
Không muốn dùng hook thì thay `git pull` bằng `./deploy.sh` (tự pull + cập nhật API).

---

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Game hiện “Ngoại tuyến” | API không truy cập được: `curl https://api.nongtrai.io.vn/up`; F12 → Console/Network xem lỗi |
| Console báo lỗi **CORS** | `CORS_ALLOWED_ORIGINS` thiếu đúng domain game (có `https://`, không `/` cuối) → sửa `server/.env` → `./deploy.sh --after-pull` |
| Console báo **Mixed Content** | Chưa bật SSL cho `api.nongtrai.io.vn` |
| `api.nongtrai.io.vn` ra trang game hoặc 404 | Thư mục subdomain chưa phải `public_html/api` (hPanel → Subdomains) |
| API trả **500** | Xem `server/storage/logs/laravel-*.log`. Hay gặp: thiếu `APP_KEY`, sai mật khẩu DB, quyền `storage/` |
| API trả **401** dù có token | Kiểm tra `api/.htaccess` còn dòng `HTTP_AUTHORIZATION` (có sẵn) |
| `git pull` báo *local changes would be overwritten* | Có file trên server bị sửa tay → `git status`, rồi `git checkout -- <file>` |
| Sửa `server/.env` không có tác dụng | `./deploy.sh --after-pull` (cache lại config) |

## Sao lưu

Hostinger có sao lưu tự động (Files → Backups). Thêm bản sao lưu database mỗi ngày:
hPanel → Advanced → **Cron Jobs** → Custom, 3:00 hằng ngày:

```bash
mkdir -p ~/backups && mysqldump -u u123456789_nongtrai -p'MAT_KHAU' u123456789_nongtrai | gzip > ~/backups/nongtrai-$(date +\%F).sql.gz && find ~/backups -name 'nongtrai-*.sql.gz' -mtime +14 -delete
```
