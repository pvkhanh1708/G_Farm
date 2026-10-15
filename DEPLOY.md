# Triển khai lên server

Hai site:

| Domain | Chứa gì | Document root |
|---|---|---|
| `nongtrai.io.vn` | Game (file tĩnh build từ `client/`) | `/var/www/nongtrai/client/dist` |
| `api.nongtrai.io.vn` | Laravel API (`server/`) | `/var/www/nongtrai/server/public` |

Cả repo được clone vào **một** thư mục (`/var/www/nongtrai`), vì server đọc `shared/economy.json` nằm cạnh
thư mục `server/`. Hướng dẫn dưới đây viết cho VPS Ubuntu 22.04/24.04 + Nginx. Nếu bạn dùng panel
(aaPanel, CyberPanel, HestiaCP…), xem mục 9.

---

## 1. Chuẩn bị server

```bash
sudo apt update
sudo apt install -y software-properties-common git unzip nginx mysql-server
sudo add-apt-repository -y ppa:ondrej/php && sudo apt update
sudo apt install -y php8.4-fpm php8.4-cli php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl \
  php8.4-zip php8.4-bcmath php8.4-intl
# Composer
curl -sS https://getcomposer.org/installer | php && sudo mv composer.phar /usr/local/bin/composer
# Node 20 (chỉ cần nếu build client ngay trên server)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
```

**DNS:** tạo bản ghi `A` cho `nongtrai.io.vn`, `www.nongtrai.io.vn` và `api.nongtrai.io.vn` trỏ về IP server.

## 2. Lấy code

Repo đang private nên tạo deploy key cho server:

```bash
sudo mkdir -p /var/www/nongtrai && sudo chown $USER:www-data /var/www/nongtrai
ssh-keygen -t ed25519 -f ~/.ssh/nongtrai_deploy -N ""
cat ~/.ssh/nongtrai_deploy.pub
# GitHub → repo G_Farm → Settings → Deploy keys → Add key (chỉ cần quyền đọc), dán nội dung trên
printf "Host github.com\n  IdentityFile ~/.ssh/nongtrai_deploy\n" >> ~/.ssh/config
git clone git@github.com:pvkhanh1708/G_Farm.git /var/www/nongtrai
```

(Nếu cổng 22 bị chặn, dùng `Host github.com` → `Hostname ssh.github.com` + `Port 443`.)

## 3. Database

```bash
sudo mysql <<'SQL'
CREATE DATABASE nongtrai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nongtrai'@'localhost' IDENTIFIED BY 'MAT_KHAU_MANH';
GRANT ALL PRIVILEGES ON nongtrai.* TO 'nongtrai'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 4. Backend (api.nongtrai.io.vn)

```bash
cd /var/www/nongtrai/server
composer install --no-dev --optimize-autoloader
cp .env.production.example .env
nano .env            # điền DB_PASSWORD (và kiểm tra CORS_ALLOWED_ORIGINS)
php artisan key:generate
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan event:cache
sudo chown -R $USER:www-data storage bootstrap/cache
sudo chmod -R ug+rwX storage bootstrap/cache
```

Các biến quan trọng trong `.env` (mẫu đầy đủ: `server/.env.production.example`):

| Biến | Giá trị |
|---|---|
| `APP_ENV` / `APP_DEBUG` | `production` / `false` — **không bật debug trên server thật** |
| `APP_URL` | `https://api.nongtrai.io.vn` |
| `DB_*` | database / user ở bước 3 |
| `CORS_ALLOWED_ORIGINS` | `https://nongtrai.io.vn,https://www.nongtrai.io.vn` — chỉ trang game được gọi API |
| `TRUSTED_PROXIES` | `127.0.0.1`; đổi thành `*` nếu đi qua Cloudflare (để giới hạn request theo IP thật) |

Sau mỗi lần sửa `.env`: `php artisan config:cache`.

## 5. Frontend (nongtrai.io.vn)

Địa chỉ API được nhúng vào bản build từ `client/.env.production`
(`VITE_API_URL=https://api.nongtrai.io.vn/api`).

**Cách A: build trên server**

```bash
cd /var/www/nongtrai/client
npm ci
npm run build        # tạo client/dist
```

**Cách B: build ở máy bạn rồi upload** (server không cần Node)

```bash
cd client && npm run build
scp -r dist/* user@IP_SERVER:/var/www/nongtrai/client/dist/
```

## 6. Nginx

`/etc/nginx/sites-available/api.nongtrai.io.vn`:

```nginx
server {
    listen 80;
    server_name api.nongtrai.io.vn;
    root /var/www/nongtrai/server/public;
    index index.php;
    charset utf-8;
    client_max_body_size 1m;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
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
    index index.html;

    gzip on;
    gzip_comp_level 6;
    gzip_types text/css application/javascript application/json image/svg+xml font/woff2;

    # file trong assets/ có hash trong tên → cache lâu
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # index.html luôn lấy bản mới để người chơi nhận bản cập nhật ngay
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api.nongtrai.io.vn /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/nongtrai.io.vn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Bundle game khoảng 7 MB (Babylon.js chiếm phần lớn); gzip giảm còn khoảng 1.5–2 MB khi tải.

## 7. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nongtrai.io.vn -d www.nongtrai.io.vn -d api.nongtrai.io.vn
```

Cả hai site **phải** chạy HTTPS: trang game https không được phép gọi API http (trình duyệt chặn).

## 8. Kiểm tra

```bash
curl https://api.nongtrai.io.vn/up                                   # 200
curl -X POST -H "Accept: application/json" https://api.nongtrai.io.vn/api/auth/guest   # trả về token
```

Mở `https://nongtrai.io.vn` → góc phải trên hiện **“Đã đồng bộ”**. Nếu hiện “Ngoại tuyến”, xem mục 11.
(Tài khoản khách tạo bằng lệnh curl ở trên có thể xóa sau; không ảnh hưởng gì.)

## 9. Nếu dùng panel (aaPanel, CyberPanel, HestiaCP…)

Không cần mục 1, 6, 7 — làm trên giao diện panel:

- **api.nongtrai.io.vn:** PHP 8.4; *Site directory / Document root* = `.../server/public`
  (aaPanel: Site → Settings → Site directory → *Running directory* `/public`);
  *URL rewrite* chọn mẫu **laravel**; bật SSL Let's Encrypt.
  Tắt `open_basedir` cho site này hoặc thêm thư mục `shared/` vào danh sách, vì API cần đọc `../shared/economy.json`.
  Trong PHP 8.4 của panel, bỏ `putenv`, `proc_open` khỏi *Disabled functions* nếu `composer`/`artisan` báo lỗi.
- **nongtrai.io.vn:** site tĩnh (không cần PHP), document root = `.../client/dist`; bật SSL.
  Không cần rewrite đặc biệt (game chỉ có 1 trang).
- Các lệnh ở mục 2, 3, 4, 5 chạy trong *Terminal* của panel (hoặc SSH).
  Nếu panel tạo sẵn thư mục site riêng (vd. `/www/wwwroot/api.nongtrai.io.vn`), clone repo vào đó và trỏ cả
  2 site về các thư mục con tương ứng, hoặc đặt `GAME_ECONOMY_PATH` trong `.env` tới file `shared/economy.json`.

## 10. Cập nhật phiên bản mới

```bash
cd /var/www/nongtrai && ./deploy.sh
```

`deploy.sh` (ở thư mục gốc repo): `git pull` → `composer install` → `migrate --force` → cache config/route →
build client (nếu server có Node). Người chơi đang mở game chỉ cần tải lại trang.

## 11. Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Game hiện “Ngoại tuyến” | API không truy cập được: thử `curl https://api.nongtrai.io.vn/up`. Mở DevTools (F12) → tab Console/Network xem lỗi |
| Console báo lỗi **CORS** | `CORS_ALLOWED_ORIGINS` chưa có đúng domain game (cả `https://`, không có `/` cuối) → sửa `.env` → `php artisan config:cache` |
| Console báo **Mixed Content** | API chưa có HTTPS, hoặc client build với URL `http://` → bật SSL, kiểm tra `client/.env.production`, build lại |
| API trả 500 | Xem `server/storage/logs/laravel-*.log`. Hay gặp: thiếu `APP_KEY`, sai quyền `storage/`, sai mật khẩu DB |
| `Economy data not found` | Thiếu thư mục `shared/` cạnh `server/` → clone cả repo, hoặc đặt `GAME_ECONOMY_PATH` |
| Sửa `.env` mà không có tác dụng | Chạy lại `php artisan config:cache` |
| Đổi giá cây trong `shared/economy.json` | Phải **build lại client** và chạy `php artisan config:cache` để 2 bên khớp nhau |

## 12. Sao lưu

```bash
# crontab -e  → sao lưu database mỗi ngày lúc 3h, giữ 14 ngày
0 3 * * * mysqldump -unongtrai -p'MAT_KHAU_MANH' nongtrai | gzip > /var/backups/nongtrai-$(date +\%F).sql.gz && find /var/backups -name 'nongtrai-*.sql.gz' -mtime +14 -delete
```
