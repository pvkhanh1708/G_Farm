# Triển khai lên Hostinger

| Site | Chứa gì | Thư mục web (`public_html`) trỏ tới |
|---|---|---|
| `nongtrai.io.vn` | Game (file tĩnh build từ `client/`) | bản build `client/dist`, upload từ máy bạn |
| `api.nongtrai.io.vn` | Laravel API (`server/`) | `~/nongtrai/server/public` (symlink) |

Code được clone vào `~/nongtrai`, **ngoài** `public_html`, để `.env`, `vendor/`, mã nguồn không bao giờ
truy cập được từ web. Cả repo phải nằm chung một chỗ vì API đọc `shared/economy.json` cạnh thư mục `server/`.

Hướng dẫn này cho gói **Web/Cloud Hosting dùng hPanel** (Premium, Business, Cloud — cần có SSH).
Nếu bạn dùng **Hostinger VPS**, xem [Phụ lục: VPS](#phụ-lục-vps-ubuntu--nginx).

---

## 1. Thiết lập trong hPanel

1. **PHP 8.4 cho site API:** Websites → `api.nongtrai.io.vn` → Advanced → **PHP Configuration** → chọn **8.4**.
2. **Bật SSH:** Advanced → **SSH Access** → Enable. Ghi lại IP, port (thường là **65002**) và username (`u123456789`).
3. **Database:** Databases → **Management** → tạo database + user. Hostinger tự thêm tiền tố, ví dụ
   `u123456789_nongtrai` / `u123456789_nongtrai`. Ghi lại tên, user, mật khẩu.
4. **SSL:** Security → **SSL** → cài SSL miễn phí cho **cả hai** site. Bắt buộc: trang game https không được gọi API http.

## 2. Lấy code (qua SSH)

```bash
ssh -p 65002 u123456789@IP_SERVER

# PHP dòng lệnh có thể khác bản của website → kiểm tra
php -v
# nếu không phải 8.4, dùng đường dẫn đầy đủ (kiểm tra bằng: ls /opt/alt/php84/usr/bin/php)
export PHP=/opt/alt/php84/usr/bin/php     # bỏ qua nếu `php -v` đã là 8.4
alias php="${PHP:-php}"

# deploy key cho repo private
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

GitHub → repo **G_Farm** → Settings → **Deploy keys** → Add deploy key → dán khóa trên (không cần quyền ghi).

```bash
git clone git@github.com:pvkhanh1708/G_Farm.git ~/nongtrai
```

## 3. Cài API

```bash
cd ~/nongtrai/server
php $(command -v composer) install --no-dev --optimize-autoloader
cp .env.production.example .env
nano .env
```

Sửa trong `.env`:

```dotenv
DB_HOST=localhost              # đúng như hPanel ghi (thường là localhost)
DB_DATABASE=u123456789_nongtrai
DB_USERNAME=u123456789_nongtrai
DB_PASSWORD=mật_khẩu_database
CORS_ALLOWED_ORIGINS=https://nongtrai.io.vn,https://www.nongtrai.io.vn
```

Các dòng khác giữ nguyên (`APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://api.nongtrai.io.vn`).

```bash
php artisan key:generate
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan event:cache
chmod -R 775 storage bootstrap/cache
```

## 4. Trỏ site API vào Laravel

Kiểm tra thư mục của site API trong File Manager. Thường là `~/domains/api.nongtrai.io.vn/public_html`.
Nếu bạn tạo API dạng *subdomain* thì có thể là `~/domains/nongtrai.io.vn/public_html/api`; khi đó dùng đường dẫn đó
ở lệnh dưới, và **đổi thư mục của subdomain** trong hPanel ra ngoài `public_html` của trang game, vì bước 5 sẽ ghi đè thư mục đó.

```bash
cd ~/domains/api.nongtrai.io.vn
mv public_html public_html.bak                 # trang mặc định của Hostinger
ln -s ~/nongtrai/server/public public_html
```

Kiểm tra:

```bash
curl https://api.nongtrai.io.vn/up                                                     # 200
curl -X POST -H "Accept: application/json" https://api.nongtrai.io.vn/auth/guest       # trả về token
```

<details>
<summary>Nếu symlink không chạy (lỗi 403/404)</summary>

Copy nội dung `public/` vào `public_html` và sửa đường dẫn trong `index.php`:

```bash
rm public_html && mkdir public_html
cp -r ~/nongtrai/server/public/. public_html/
sed -i "s#__DIR__.'/../#'$HOME/nongtrai/server/#g" public_html/index.php
```

Lặp lại 2 lệnh `cp` + `sed` sau mỗi lần cập nhật nếu `server/public` thay đổi (hiếm khi).
</details>

## 5. Upload game

Server Hostinger không có Node, nên build ở **máy bạn**. Địa chỉ API đã được đặt sẵn trong
`client/.env.production` (`VITE_API_URL=https://api.nongtrai.io.vn`).

```bash
cd client
npm run package        # build + nén thành client/web.tgz (gồm cả .htaccess nén/cache)
scp -P 65002 web.tgz u123456789@IP_SERVER:~/
```

Trên server:

```bash
cd ~/domains/nongtrai.io.vn/public_html
rm -rf ./* ./.htaccess                       # xóa trang mặc định / bản cũ
tar -xzf ~/web.tgz -C . && rm ~/web.tgz
```

(Không dùng SSH được thì: hPanel → File Manager → `public_html` → xóa file cũ → Upload `web.tgz` → Extract.)

Mở **https://nongtrai.io.vn**: góc phải trên hiện **“Đã đồng bộ”** là xong.

## 6. Cập nhật phiên bản mới

Trên máy bạn: `git push`. Sau đó:

```bash
# API (trên server)
cd ~/nongtrai && PHP=/opt/alt/php84/usr/bin/php ./deploy.sh    # hoặc ./deploy.sh nếu `php` đã là 8.4
```

`deploy.sh`: `git pull` → `composer install` → `migrate --force` → cache config/route.

Game có thay đổi thì làm lại **bước 5**. Người chơi chỉ cần tải lại trang (file `index.html` không bị cache,
các file JS có hash trong tên nên luôn lấy đúng bản mới).

Đổi giá / XP trong `shared/economy.json` thì phải làm **cả hai**: `deploy.sh` cho API và bước 5 cho game,
để hai bên dùng cùng số liệu.

## 7. Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Game hiện “Ngoại tuyến” | API không truy cập được: thử `curl https://api.nongtrai.io.vn/up`; mở F12 → Console/Network xem lỗi |
| Console báo lỗi **CORS** | `CORS_ALLOWED_ORIGINS` thiếu đúng domain game (có `https://`, không có `/` cuối) → sửa `.env` → `php artisan config:cache` |
| Console báo **Mixed Content** | Chưa bật SSL cho `api.nongtrai.io.vn` |
| API trả **500** | Xem `~/nongtrai/server/storage/logs/laravel-*.log`. Hay gặp: thiếu `APP_KEY`, sai mật khẩu DB, quyền `storage/` |
| API trả **401** dù đã có token | LiteSpeed không chuyển header `Authorization`: kiểm tra `public/.htaccess` còn dòng `HTTP_AUTHORIZATION` (có sẵn trong Laravel) |
| `composer`/`artisan` báo cần PHP mới hơn | Đang dùng PHP dòng lệnh cũ → dùng `/opt/alt/php84/usr/bin/php` (bước 2) |
| `Economy data not found` | Thiếu thư mục `shared/` cạnh `server/` → phải clone cả repo |
| Sửa `.env` không có tác dụng | Chạy lại `php artisan config:cache` |

## 8. Sao lưu

Hostinger có sao lưu tự động (Files & Databases → Backups). Thêm bản sao lưu database riêng mỗi ngày:
hPanel → Advanced → **Cron Jobs** → Custom, chạy lúc 3:00 mỗi ngày:

```bash
mkdir -p ~/backups && mysqldump -u u123456789_nongtrai -p'MAT_KHAU' u123456789_nongtrai | gzip > ~/backups/nongtrai-$(date +\%F).sql.gz && find ~/backups -name 'nongtrai-*.sql.gz' -mtime +14 -delete
```

---

## Phụ lục: VPS (Ubuntu + Nginx)

Dùng khi chạy trên **Hostinger VPS** hoặc VPS khác (có quyền root).

**Cài đặt:**

```bash
sudo apt update
sudo apt install -y software-properties-common git unzip nginx mysql-server
sudo add-apt-repository -y ppa:ondrej/php && sudo apt update
sudo apt install -y php8.4-fpm php8.4-cli php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-bcmath php8.4-intl
curl -sS https://getcomposer.org/installer | php && sudo mv composer.phar /usr/local/bin/composer
sudo mkdir -p /var/www/nongtrai && sudo chown $USER:www-data /var/www/nongtrai
git clone git@github.com:pvkhanh1708/G_Farm.git /var/www/nongtrai
```

Database: `CREATE DATABASE nongtrai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` + user riêng.
Cài API như bước 3 (thư mục `/var/www/nongtrai/server`, quyền `chown -R $USER:www-data storage bootstrap/cache`).
Game: build như bước 5 rồi giải nén vào `/var/www/nongtrai/client/dist`.

`/etc/nginx/sites-available/api.nongtrai.io.vn`:

```nginx
server {
    listen 80;
    server_name api.nongtrai.io.vn;
    root /var/www/nongtrai/server/public;
    index index.php;
    location / { try_files $uri $uri/ /index.php?$query_string; }
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }
    location ~ /\.(?!well-known).* { deny all; }
}
```

`/etc/nginx/sites-available/nongtrai.io.vn`:

```nginx
server {
    listen 80;
    server_name nongtrai.io.vn www.nongtrai.io.vn;
    root /var/www/nongtrai/client/dist;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location / { add_header Cache-Control "no-cache"; try_files $uri /index.html; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/{api.nongtrai.io.vn,nongtrai.io.vn} /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nongtrai.io.vn -d www.nongtrai.io.vn -d api.nongtrai.io.vn
```
