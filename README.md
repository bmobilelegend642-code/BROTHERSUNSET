# WESTINDUSTRY Donation Site

Halaman donasi sendiri dengan **Login dengan Roblox** (OAuth 2.0 + PKCE), pengganti ketergantungan ke BagiBagi.co.

## Yang sudah jalan
- Login dengan Roblox (dapat username, nama, foto profil user).
- Form donasi (jumlah + pesan) → tercatat ke `data/donations.json`.
- Setiap kali ada yang login, datanya (Roblox id, username, nama, foto, kapan pertama & terakhir login, jumlah login) disimpan permanen ke `data/users.json`.
- Feed donasi terbaru di halaman.
- Endpoint `GET /api/donations` — bisa dipoll dari relay server Render kamu, sama seperti pola yang sudah kamu pakai buat Saweria dulu, supaya papan donasi in-game ikut update.

## Supaya data nggak hilang tiap redeploy (Persistent Disk)
Secara default, `donations.json` dan `users.json` disimpan di folder `data/` di dalam aplikasi — di hosting seperti Render, folder ini **direset tiap kali redeploy**. Supaya datanya awet:

1. Di dashboard Render, buka service ini → **Disks** → **Add Disk**. Kasih nama bebas, mount path isi `/var/data`, ukuran 1GB juga sudah cukup.
2. Tambah environment variable `DATA_DIR=/var/data`.
3. Redeploy. Setelah ini, `data/donations.json` dan `data/users.json` otomatis dibuat di disk yang persistent itu, bukan di folder aplikasi.

Kalau jalan lokal tanpa isi `DATA_DIR`, datanya tetap kesimpan normal di folder `data/` di komputer kamu (nggak hilang, karena bukan di-redeploy terus).

## Yang BELUM: pembayaran uang beneran
Form donasi di sini cuma **mencatat** angka yang diinput orang — belum ada uang yang benar-benar berpindah. Untuk itu kamu perlu payment gateway seperti Midtrans, Xendit, atau QRIS langsung dari bank/e-wallet. Titik yang harus disambung ada di `server.js`, fungsi `app.post('/api/donate', ...)` — di situ tinggal ditambah langkah "buat transaksi pembayaran" sebelum donasi dicatat sebagai sukses, dan endpoint callback dari gateway itu buat konfirmasinya. Kalau kamu udah pilih gateway mana, bilang aja, nanti aku bantu sambungin.

## Setup

### 1. Daftar OAuth App di Roblox
1. Buka https://create.roblox.com → **Credentials / OAuth 2.0 Apps** → **Create App**.
2. Isi nama app, terima ToS.
3. Salin **Client ID** dan **Client Secret** (secret cuma muncul sekali!).
4. Set **Redirect URI** persis sama dengan yang kamu pakai nanti, contoh:
   - lokal: `http://localhost:3000/auth/roblox/callback`
   - production: `https://domainkamu.com/auth/roblox/callback`
5. Scope yang dicentang: `openid` dan `profile`.

### 2. Install & konfigurasi
```bash
npm install
cp .env.example .env
```
Isi `.env` dengan Client ID, Client Secret, dan Redirect URI dari langkah 1.

### 3. Jalankan
```bash
npm start
```
Buka `http://localhost:3000`.

## Struktur file
```
server.js          → backend (OAuth + API donasi)
public/index.html  → halaman
public/style.css    → tampilan
public/script.js    → interaksi frontend
data/donations.json → penyimpanan donasi (file JSON sederhana)
```

## Deploy
Karena `client_secret` harus rahasia, situs ini **wajib** dijalankan dengan server Node (bukan hosting statis). Bisa deploy ke Render/Railway/VPS — sama seperti relay server kamu yang sekarang. Kalau mau deploy ke Render, tinggal push repo ini dan set environment variables yang sama seperti di `.env` lewat dashboard Render.
