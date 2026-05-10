# TransLingua

AI destekli belge çeviri, doküman soru-cevap ve ders notu çıkarma uygulaması.

## Teknoloji

- React 19 + TypeScript
- Vite
- Supabase Auth, Database, Storage ve Edge Functions
- Framer Motion
- PDF.js, React Markdown ve html2pdf

## Kurulum

```bash
npm install
cp .env.example .env.local
npm run dev
```

Uygulama varsayılan olarak `http://localhost:5173` adresinde çalışır.

## Ortam Değişkenleri

Frontend için:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AI_MODE=demo
```

AI modları:

- `demo`: Harici AI çağrısı yapmaz, demo yanıtı döndürür.
- `direct`: Tarayıcıdan AI sağlayıcısına doğrudan istek atar. Sadece lokal deneme için kullanın.
- `supabase`: `ai-proxy` Supabase Edge Function üzerinden çalışır. Üretim için önerilen mod budur.

Supabase Edge Function secret değerleri:

```bash
supabase secrets set AI_API_KEY=... AI_API_URL=...
```

Üretimde AI anahtarını `VITE_` ile başlayan frontend değişkenlerinde tutmayın.

## Supabase

İlk migration:

```bash
supabase db push
```

Eklenen ana parçalar:

- `profiles`, `documents`, `translations`, `chat_messages`
- `credit_transactions`, `study_sessions`, `study_sources`
- RLS politikaları
- `originals` ve `study-sources` private storage bucket ayarları
- Yeni auth kullanıcısı için profil oluşturma trigger’ı

AI proxy deploy:

```bash
supabase functions deploy ai-proxy
```

## Komutlar

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

## Notlar

- `supabase/.temp` ve `.claude` yerel çalışma dosyalarıdır, git dışında tutulur.
- PDF ve PDF export bağımlılıkları route bazlı lazy-load edilir; ilk açılış bundle’ı küçük tutulur.
- Ders notu akışında OCR/dosya metni çıkarma hâlâ ürünleştirilecek bir sonraki backend adımıdır.
