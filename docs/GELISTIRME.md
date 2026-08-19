# HLauncher — 2 Kişilik Geliştirme Rehberi

Tek doğruluk kaynağı **GitHub'daki repo**dur (`HardSetups/HLauncher`). Kimse
dosyaları elle paylaşmaz (OneDrive/USB/zip yok); her geliştirici kendi
makinesinde kendi klonuyla çalışır, her şey git üzerinden akar.

## 0. Yeni geliştirici kurulumu (bir kez)

```bash
# OneDrive/Drive senkron klasörlerinin DIŞINA klonla (dosya kilidi build bozar)
git clone https://github.com/HardSetups/HLauncher.git C:\Dev\HLauncher
cd C:\Dev\HLauncher
npm ci            # package-lock.json'a birebir uyar — npm install DEĞİL
npm run dev       # uygulama açılıyorsa kurulum tamam
npm test          # 49+ test yeşil olmalı
```

- Git kimliğini ayarla: `git config user.name "Adın"` + `git config user.email "mailin"`.
- GitHub'a push için kendi hesabınla giriş yaparsın (Git Credential Manager ilk push'ta sorar).
- `ELECTRON_RUN_AS_NODE` makinende tanımlı değilse hiçbir şey yapmana gerek yok; tanımlıysa da dev akışı bunu kendisi çözer (CLAUDE.md → Machine Notes).

## 1. Günlük akış

```bash
git switch main
git pull --rebase          # HER işe başlamadan önce — çakışmayı baştan önler
# ... çalış ...
npm run lint && npm test   # push kapısı: ikisi de yeşil olmadan push yok
git add -A && git commit -m "kısa türkçe özet: ne ve neden"
git pull --rebase          # push'tan hemen önce bir daha
git push
```

Kurallar:
- **Küçük, sık commit** — bir commit tek bir işi anlatsın.
- **main'e doğrudan push serbesttir** ama yalnızca küçük/riski düşük işler için.
  Büyük özellik, riskli refactor veya launcher çekirdeğine (electron/launcher.cjs,
  lib/download, lib/java) dokunan işler **dal + PR** ile gider:
  `git switch -c feature/kisa-ad` → push → GitHub'da PR aç → CI yeşil + diğer kişi
  onayı → **Squash & merge**.
- `git push --force` main'de YASAK (dallarda kendi dalınsa serbest).
- Çekirdek bir dosyada ikiniz aynı anda çalışacaksanız önce haberleşin
  (Discord'a "launcher.cjs bende" yazmak yeterli).

## 2. Çakışma çıkarsa

- `package-lock.json` çakıştı → dosyayı karşı taraftan al (`git checkout --theirs package-lock.json`), sonra `npm install` çalıştırıp yeniden commit'le.
- `CHANGELOG.md` / `src/i18n.jsx` çakıştı → ikisi de "iki tarafı da tut" tipi dosyadır; iki bloğu da bırak, sıralamayı düzelt. i18n'de anahtar unutulursa `npm test` yakalar.
- Emin olamadığın çakışmada: `git rebase --abort` deyip diğer geliştiriciyle bak.

## 3. QC kapısı (push edilmeden önce)

| Değişiklik | Zorunlu kontrol |
|---|---|
| Her push | `npm run lint && npm test` |
| src/ (arayüz) değiştiyse | + `npm run build` |
| electron/ değiştiyse | + `node --check` ilgili dosyalar (lint zaten kapsıyor) |
| Sürüm çıkarmadan önce | + `npm run test:integration` (gerçek ağ testleri) |

CI her push'ta lint+test+build koşar; **CI kırmızıyken asla tag atma**.

## 4. Sürüm çıkarma (tek kişi yapar!)

Aynı anda iki kişi sürüm çıkarmaz — Discord'dan "alpha.N'i ben çıkarıyorum" de.

1. `npm version 1.0.0-alpha.N --no-git-tag-version`
2. `CHANGELOG.md`'ye bölüm ekle (tarihiyle)
3. Commit + push → **CI yeşilini bekle**
4. `git tag v1.0.0-alpha.N && git push origin v1.0.0-alpha.N`
5. CI, kurulum paketi + `latest.yml` ile **taslak release** üretir (birkaç dk)
6. GitHub → Releases → taslağı düzenle → notları yaz → **Pre-release** işaretle → **Publish release**
7. Doğrula: yeni exe'nin indirme linki çalışıyor mu, `latest.yml` yeni sürümü gösteriyor mu
8. Kurulu launcher'lar otomatik güncellenir. Oyunculara duyuru: kökteki `news.json`'a kayıt ekleyip push'la

## 5. Sorumluluk paylaşımı önerisi

- İş takibi **GitHub Issues** ile: her iş bir issue, üstlenen kendini atar
  (aynı işi iki kişinin yapmasını önlemenin tek yolu budur).
- PR'ları mümkünse **diğer kişi** gözden geçirir.
- `main` her an yayınlanabilir durumda tutulur — "yarım iş" main'e girmez, dalında bekler.

## 6. Paylaşılan ve paylaşılamayan şeyler

| Paylaşılır (repo'da) | Paylaşılmaz (kişisel) |
|---|---|
| Kod, testler, docs, CLAUDE.md, news.json | `node_modules/`, `dist/`, `release/` (git zaten yok sayar) |
| CI ve release yapılandırması | GitHub kimlik bilgileri (herkes kendi hesabı) |
| .gitattributes / eslint / vite ayarları | `%APPDATA%\.hlauncher` (kişisel oyun/ayar verisi) |

Sır (token/anahtar) repo'ya asla girmez; CI kendi `GITHUB_TOKEN`'ını otomatik alır.
