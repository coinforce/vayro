# VAYRO

Aracını kamerayla tara, yapay zekâ tanısın, sen onayla; fotoğraflarından 3D modeli üretilsin ve garajında dursun.

## Ne yapar

- **Tarama:** Altı açıdan fotoğraf (ön, arka, iki yan, iki çapraz). Telefonda kamera açılır.
- **Tanıma:** Fotoğraflar Claude'a gider; marka, model, yıl aralığı, kasa tipi, renk, far, jant ve ayırt edici özellikler güven puanıyla döner. Emin olunmayan alanlar boş gelir.
- **Onay:** Kullanıcı onaylamadan hiçbir şey kaydedilmez. Kayıt "AI görsel eşleşmesi"dir, sahiplik doğrulaması değildir.
- **3D model:** Onaydan sonra fotoğraflar Meshy'nin çok görselli image-to-3D servisine gider. Üretilen GLB (ve iPhone için USDZ) kendi depona kopyalanır.
- **Görüntüleme ve AR:** `<model-viewer>` ile döndürme, yakınlaştırma; destekleyen cihazlarda AR (Android Scene Viewer, iOS Quick Look).
- **Garaj ve Keşfet:** 3D kartlar, özel isim, açıklama, modifiye parçaları, özel/herkese açık, öne çıkarma, beğeni ve sıralama.

## Yapı

```
index.html, app.js, styles.css   Arayüz (derleme adımı yok)
api/config.js                    Açık ayarlar ve hangi servislerin bağlı olduğu
api/recognize.js                 Araç tanıma (Claude)
api/model-start.js               3D üretimi başlatır (Meshy)
api/model-status.js              Üretimi izler, biten modeli depoya kopyalar
supabase/schema.sql              Tablolar, erişim kuralları, dosya kovaları
```

Dış paket yoktur; `npm install` gerekmez.

## Kurulum

### 1. Supabase
1. supabase.com üzerinde yeni bir proje aç.
2. **SQL Editor** içine `supabase/schema.sql` dosyasının tamamını yapıştır ve çalıştır.
3. **Authentication > Sign In / Providers > Email** altında denemeyi kolaylaştırmak için "Confirm email" seçeneğini kapatabilirsin. Açık kalırsa yeni hesaplar e-postadaki bağlantıyı onaylamak zorundadır.
4. **Project Settings > API** sayfasından üç değeri al: Project URL, `anon` anahtarı, `service_role` anahtarı. `service_role` anahtarını kimseyle paylaşma.

### 2. Servis anahtarları
- **Anthropic:** console.anthropic.com üzerinden bir API anahtarı (araç tanıma için).
- **Meshy:** meshy.ai üzerinden API anahtarı ve kredi (3D üretim için). 2K dokulu bir model, belgelere göre 30 kredi harcar.

Bu ikisi olmadan uygulama açılır ama ilgili özellik "bağlı değil" olarak görünür; sahte sonuç üretmez.

### 3. Vercel
1. vercel.com üzerinde **Add New > Project** ile bu depoyu içe aktar. Framework Preset: **Other**. Build komutu boş kalsın.
2. **Settings > Environment Variables** altına `.env.example` dosyasındaki değişkenleri gir.
3. Deploy et. Açılan adresi telefonda aç.

## Bilinen sınırlar

- Bu kod yazıldığı ortamda canlı servislere karşı çalıştırılamadı. Sunucu işlevleri sahte yanıtlarla test edildi (`npm test`); Supabase, Anthropic ve Meshy ile gerçek uçtan uca deneme ilk kurulumda yapılmalı.
- 3D model yapay zekâ üretimidir. Fotoğrafta görünmeyen yüzeyler tahmindir; parlak boya ve camlar kaliteyi düşürebilir.
- Meshy en fazla 4 görsel kabul eder: ön, bir yan, arka ve bir çapraz gönderilir.
- 3D model dosyaları herkese açık bir kovada, tahmin edilemez bir yolda durur. Fotoğraflar özeldir ve yalnızca sahibine gösterilir.
- Sıralama, herkese açık araçların beğeni sayısına göre basit bir sıradır.
- Supabase'in yeni tip anahtarlarıyla (`sb_publishable_`, `sb_secret_`) denenmedi; "Legacy API keys" sekmesindeki `anon` ve `service_role` anahtarlarını kullan.
