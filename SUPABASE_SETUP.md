# Wordshire 雲端帳號設定

1. 到 [Supabase](https://supabase.com/) 建立一個專案。
2. 開啟專案的 **SQL Editor**，執行 `supabase/schema.sql` 的全部內容。
3. 在 **Authentication → Providers → Email** 確認 Email 登入已啟用。
4. 在 **Project Settings → API** 複製 Project URL 與 Publishable key（舊專案可能顯示 anon key）。
5. 複製 `.env.example` 為 `.env.local`，填入：

   ```env
   VITE_SUPABASE_URL=https://你的專案.supabase.co
   VITE_SUPABASE_ANON_KEY=你的_publishable_key
   ```

6. 重新啟動 `npm run dev`。

部署到 Vercel、Cloudflare Pages 等平台時，也要在平台的環境變數設定中加入相同的兩個值。請勿把 `service_role` 金鑰放進前端。

預設若 Supabase 開啟「Confirm email」，新使用者註冊後需先點信箱中的確認連結才能登入；開發測試時可在 Authentication 設定中調整。
