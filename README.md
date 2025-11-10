# IT Literature Shop – Backend (Express + TypeScript + Prisma + PostgreSQL/Neon)

> Backend sesuai ketentuan Praktikum Web (Modul 3): Express + TypeScript + PostgreSQL (Neon) + Prisma ORM + JWT. Health check mengembalikan tanggal saat ini. Semua response: `{ success, message, data }`.

## Tech Stack
- Express + TypeScript
- PostgreSQL (Neon) + Prisma ORM
- JWT (autentikasi Bearer)
- Zod untuk validasi sederhana

## Struktur Proyek
```
it-literature-shop-backend/
├─ prisma/
│  └─ schema.prisma
├─ src/
│  ├─ app.ts
│  ├─ server.ts
│  ├─ lib/
│  │  ├─ prisma.ts
│  │  └─ response.ts
│  ├─ middlewares/
│  │  ├─ auth.ts
│  │  └─ error.ts
│  ├─ utils/pagination.ts
│  └─ modules/
│     ├─ auth/router.ts
│     ├─ genre/router.ts
│     ├─ book/router.ts
│     └─ transaction/router.ts
├─ .env.example
├─ package.json
└─ tsconfig.json
```

## Cara Menjalankan (Local)
1. **Clone & Install**
   ```bash
   npm i
   ```
2. **Salin ENV**
   ```bash
   cp .env.example .env
   ```
   Isi `DATABASE_URL` dengan **Neon Postgres** connection string dan `JWT_SECRET` dengan string acak.
3. **Prisma Setup**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```
4. **Run Dev**
   ```bash
   npm run dev
   ```
   Server: `http://localhost:8080`
5. **Health Check**
   ```http
   GET /health  ->  { "success": true, "data": { "date": "<ISO>" } }
   ```

## Endpoint Utama
- `/auth/register`, `/auth/login`, `/auth/me`  
- `/genre` (POST/GET/GET:id/PATCH:id/DELETE:id) – **soft delete**  
- `/books` (POST/GET/GET:id/PATCH:id/DELETE:id) + `/books/genre/:id` – **soft delete**  
- `/transactions` (POST/GET/GET:id) + `/transactions/statistics`  

> Semua endpoint selain **/auth/** dan **/health** membutuhkan Bearer Token.

## Catatan Implementasi
- **Unik Title Buku**: dicek manual terhadap buku aktif (`deleted_at IS NULL`) sebelum `create` untuk mencegah duplikasi (tetap aman saat soft delete).
- **Soft Delete** genre & buku: hanya set `deleted_at`, **order/order_items tidak terhapus**.
- **Create Transaction**: validasi stok, transaksi atomic (`$transaction`), stok berkurang, respons memuat `transaction_id`, `total_quantity`, `total_price`.
- **List + Paging**: `page`, `limit`, `search`, dan **sort** (`orderByTitle`, `orderByPublishDate`, `orderByName`, `orderById`, `orderByAmount`). Response menyertakan `meta`.
- **Statistics**: 
  - `total_transactions`, 
  - `average_nominal_per_transaction` (rata-rata `total_price`), 
  - `most_sold_genre` & `least_sold_genre` dihitung dari **jumlah transaksi distinct** yang mengandung genre tsb.

## Quick Test (curl)
```bash
# register
curl -s -XPOST localhost:8080/auth/register -H "content-type: application/json"   -d '{"email":"dummy@gmail.com","password":"Dummy.12345","username":"Mr. Dummy"}'

# login
TOKEN=$(curl -s -XPOST localhost:8080/auth/login -H "content-type: application/json"   -d '{"email":"dummy@gmail.com","password":"Dummy.12345"}' | jq -r .data.access_token)

# create genre
curl -s -XPOST localhost:8080/genre -H "authorization: Bearer $TOKEN"   -H "content-type: application/json" -d '{"name":"Fiksi"}'

# create book
curl -s -XPOST localhost:8080/books -H "authorization: Bearer $TOKEN"   -H "content-type: application/json"   -d '{"title":"Dummy Book","writer":"Anon","publisher":"ITS Press","publication_year":2025,"price":50000,"stock_quantity":50,"genre_id":"<GENRE_ID>"}'
```

## Penyesuaian ke Dokumen Praktikum
- Response format telah mengikuti `{ success, message, data }`.
- Endpoint dipisah per modul (`/auth`, `/books`, `/genre`, `/transactions`).
- Health check `/health` mengembalikan tanggal.
- Seluruh logika menggunakan **TypeScript** dan **JWT**.

Selamat mencoba dan semoga lancar demo-nya!
