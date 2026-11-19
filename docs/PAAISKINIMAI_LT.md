# Paaiškinimai (LT)

Kiekvienam svarbiam failui: **ką daro**, **kodėl taip**, **ko gali paklausti pokalbyje**.

## `api/index.go`
- **Ką daro:** vienintelė Vercel serverless funkcija. Eksportuojama `Handler(w, r)` tiesiog perduoda užklausą `server.NewRouter()` sukurtam routeriui.
- **Kodėl taip:** Vercel kiekvieną `.go` failą `/api` kataloge paverčia atskira funkcija. Viena funkcija + `vercel.json` rewrite reiškia vieną cold start, vieną deploy vienetą ir paprastą maršrutizavimą pačiame Go kode. Router'is kuriamas kaip paketo lygio kintamasis, todėl sukuriamas vieną kartą per cold start, o ne per kiekvieną užklausą.
- **Gali paklausti:** „Kodėl ne kiekvienam endpoint'ui atskiras failas?" – daugiau cold start'ų, dubliuotas kodas, sunkiau dalintis DB prisijungimu. „Kodėl `package handler`?" – Vercel Go runtime ieško eksportuotos `Handler` funkcijos šiame pakete.

## `vercel.json`
- **Ką daro:** `framework: "vite"` aiškiai nurodo frontend preset'ą; `regions: ["fra1"]` – funkcijos Frankfurte (arčiau Neon DB); rewrite `/api/(.*)` → `/api` nukreipia visus API kelius į vieną funkciją; paskutinė taisyklė `/(.*)` → `/index.html` yra SPA fallback (kliento maršrutams).
- **Kodėl taip:** taisyklių tvarka svarbi – API rewrite turi būti pirmas, kitaip API užklausas „pagautų" SPA fallback. `framework` nurodytas aiškiai, nes `go.mod` šaknyje galėtų priversti Vercel pasirinkti Go preset'ą.
- **Gali paklausti:** „Kokį kelią mato funkcija po rewrite?" – tikimės originalaus (`/api/health`); tai reikia patikrinti po deploy (žr. ataskaitos atvirą klausimą).

## `internal/server/` (`router.go`, `health.go`, `respond.go`)
- **Ką daro:** `NewRouter()` užregistruoja `GET /api/health` (200, `{"status":"ok"}`), kitus metodus tam pačiam keliui (405 JSON) ir `/api/` „catch-all" (404 JSON). `respond.go` – bendri JSON atsakymo helperiai.
- **Kodėl `internal/`:** visa logika vienoje vietoje, kurią naudoja ir Vercel funkcija, ir vietinis serveris. `internal/` paketo negali importuoti kiti moduliai – aiški riba. `api/index.go` lieka plonas, o logiką galima testuoti be Vercel.
- **Kodėl tik standartinė biblioteka:** `net/http` ServeMux nuo Go 1.22 palaiko metodus ir kelio parametrus – papildomo router'io nereikia, mažiau priklausomybių.
- **Gali paklausti:** „Kodėl 404 grąžina JSON?" – frontend visada gauna nuspėjamą formatą, ne HTML. „Kaip veikia pattern'ų pirmenybė?" – konkretesnis pattern (`GET /api/health`) laimi prieš bendresnį (`/api/health`, `/api/`).

## `cmd/local/main.go`
- **Ką daro:** paleidžia **tą patį** router'į ant `:8080` vietiniam vystymui.
- **Kodėl taip:** nereikia Vercel CLI; paleidimas greitas. Vite dev serveris `/api` užklausas proxy'ina į `:8080`.
- **Kodėl būtent `cmd/local`:** Vercel Go preset automatiškai atpažįsta `main.go` šaknyje, `cmd/api/` ir `cmd/server/` ir pereitų į kitą deploy modelį. `cmd/local` to išvengia.
- **Gali paklausti:** „Ar lokali versija identiška production?" – router'is tas pats, skiriasi tik įėjimo taškas.

## `go.mod` ir Go ≥ 1.22
- **Kodėl:** metodų ir `{id}` wildcard'ų pattern'ai (`GET /api/items/{id}`) ServeMux veikia tik jei `go.mod` deklaruoja `go 1.22` ar naujesnę. Su senesne versija pattern'as būtų traktuojamas kaip paprastas kelias ir maršrutai tyliai neveiktų.
- **Gali paklausti:** „Kodėl ne chi/gin?" – nereikalingos priklausomybės, standartinė biblioteka pakanka.

## Pooled connection string (`.env.example`)
- **Ką daro:** `DATABASE_URL` vieta; reikšmė NIEKADA nededama į repo.
- **Kodėl pooled (`-pooler` host'as):** serverless funkcijos daug kartų atidaro trumpas jungtis. Neon turi ribotą tiesioginių Postgres jungčių skaičių; pooler (PgBouncer) jas multipleksuoja, todėl jungčių neišnaudojame.
- **Gali paklausti:** „Kuo skiriasi pooled nuo direct?" – direct skirtas ilgalaikėms jungtims (pvz., migracijoms), pooled – daugybei trumpų.

## Frontend (`src/App.tsx`, `vite.config.ts`)
- **Ką daro:** `App` užkrovus kviečia `/api/health` ir rodo „API: ok" arba „API: error". `vite.config.ts` turi dev proxy `/api` → `http://localhost:8080`.
- **Kodėl proxy:** naršyklė kalba tik su Vite portu, todėl nėra CORS problemų. Production'e frontend ir API yra tame pačiame domene.
