# Web-design

Mã nguồn theo tuần học.

## Cấu trúc

```
week1/portfolio/     Terminal portfolio (Express + EJS)
week2/
  ssr/               Symlink tới week1/portfolio (bài SSR)
  csr/               Danh bạ sinh viên (Client-Side Rendering)
week3/
  restaurant/        Restaurant SSR (Express + EJS + Prisma)
  soucha/            App Soucha (Next.js)
  restaurant_SSR/    Slide + yêu cầu bài Restaurant SSR
week4/
  api/               Soucha REST API (Express + Prisma + PostgreSQL/Supabase)
  web/               Soucha SPA (JavaScript modules + History API)
  BAO-CAO-DOI-CHIEU.md  Báo cáo thay đổi và đối chiếu đề REST API và SPA
```

## Chạy nhanh

```bash
# Tuần 1 / SSR tuần 2
cd week1/portfolio && npm install && npm start

# Tuần 2 CSR
cd week2/csr && npm install && npm start

# Tuần 3
cd week3/soucha && npm install && npm run dev
cd week3/restaurant && npm install && npm start

# Tuần 4 — xem week4/README.md và week4/BAO-CAO-DOI-CHIEU.md
cd week4
npm install
npm run setup
npm run dev
```
