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

## `pkg/server/` (`router.go`, `health.go`, `respond.go`)
- **Ką daro:** `NewRouter()` užregistruoja `GET /api/health` (200, `{"status":"ok"}`), kitus metodus tam pačiam keliui (405 JSON) ir `/api/` „catch-all" (404 JSON). `respond.go` – bendri JSON atsakymo helperiai.
- **Kodėl atskiras paketas, o ne logika `api/`:** visa logika vienoje vietoje, kurią naudoja ir Vercel funkcija, ir vietinis serveris. `api/index.go` lieka plonas, o logiką galima testuoti be Vercel. (Kodėl `pkg/`, o ne `internal/` – žr. sekciją žemiau.)
- **Kodėl tik standartinė biblioteka:** `net/http` ServeMux nuo Go 1.22 palaiko metodus ir kelio parametrus – papildomo router'io nereikia, mažiau priklausomybių.
- **Gali paklausti:** „Kodėl 404 grąžina JSON?" – frontend visada gauna nuspėjamą formatą, ne HTML. „Kaip veikia pattern'ų pirmenybė?" – konkretesnis pattern (`GET /api/health`) laimi prieš bendresnį (`/api/health`, `/api/`).

## Kodėl `pkg/`, o ne `internal/`
- **Go `internal` taisyklė:** paketą, esantį kataloge `internal/`, gali importuoti tik kodas, kurio kelias yra to `internal/` tėvinio katalogo viduje (t. y. to paties modulio/medžio kodas). Tai kompiliatoriaus vykdoma „privatumo" riba.
- **Kas nutiko:** Vercel `api/index.go` kompiliuoja kaip atskirą paketą (`handler/api`, `command-line-arguments`), kurio kelias nėra mūsų modulio medžio viduje. Todėl kompiliatorius jį laiko „išoriniu" ir atmeta importą: `use of internal package .../internal/server not allowed`. Lokaliai (`go build ./...`) viskas veikė, nes ten paketas kompiliuojamas kaip modulio dalis – klaida išlindo tik Vercel build'e.
- **Sprendimas:** `internal/server` → `pkg/server`. `pkg/` neturi jokios ypatingos reikšmės kompiliatoriui, todėl importas leidžiamas. Logika vis dar yra už `/api` ribų, o `api/index.go` tik perduoda užklausą.
- **Kompromisas:** prarandame kompiliatoriaus garantiją, kad niekas iš išorės neimportuos šio paketo. Šiame projekte tai nesvarbu – tai ne bibliotekos modulis.
- **Gali paklausti:** „Kodėl lokaliai veikė, o Vercel – ne?" – skirtingas kompiliavimo kontekstas. „Ar `pkg/` yra Go standartas?" – ne, tai tik paplitusi konvencija (golang-standards/project-layout), kompiliatorius jos neapdoroja.

## `cmd/local/main.go`
- **Ką daro:** paleidžia **tą patį** router'į ant `:8080` vietiniam vystymui.
- **Kodėl taip:** nereikia Vercel CLI; paleidimas greitas. Vite dev serveris `/api` užklausas proxy'ina į `:8080`.
- **Kodėl būtent `cmd/local`:** Vercel Go preset automatiškai atpažįsta `main.go` šaknyje, `cmd/api/` ir `cmd/server/` ir pereitų į kitą deploy modelį. `cmd/local` to išvengia.
- **Gali paklausti:** „Ar lokali versija identiška production?" – router'is tas pats, skiriasi tik įėjimo taškas.

## `go.mod` ir Go versija
- **Kodėl ≥ 1.22:** metodų ir `{id}` wildcard'ų pattern'ai (`GET /api/items/{id}`) ServeMux veikia tik jei `go.mod` deklaruoja `go 1.22` ar naujesnę. Su senesne versija pattern'as būtų traktuojamas kaip paprastas kelias ir maršrutai tyliai neveiktų.
- **Kodėl dabar `go 1.25.0`:** pridėjus `pgx v5` (ir jo priklausomybę `golang.org/x/text`) `go get` automatiškai pakėlė `go` direktyvą – naujausi pgx reikalauja Go 1.25. Vercel Go runtime Go versiją skaito būtent iš `go.mod` `go` direktyvos, todėl tai yra ir versija, kuria bus kompiliuojama production'e. Lokaliai taip pat reikia Go ≥ 1.25.
- **Gali paklausti:** „Kodėl ne chi/gin?" – nereikalingos priklausomybės, standartinė biblioteka pakanka. „Kas pakėlė Go versiją?" – priklausomybė, ne mūsų sprendimas; `go mod why`/`go list -m -f '{{.GoVersion}}'` parodo, kuris modulis ko reikalauja.

## Pooled ir direct jungtis, PgBouncer transaction mode
- **Ką daro:** `.env.example` turi du kintamuosius. `DATABASE_URL` – **pooled** jungtis (`-pooler` host'as), kurią naudoja aplikacija. `DATABASE_URL_DIRECT` – tiesioginė jungtis, skirta tik migracijoms (vėlesnė užduotis) ir niekada nenustatoma Vercel'yje. Realios reikšmės NIEKADA nededamos į repo (`.env` yra `.gitignore`).
- **Kodėl pooled aplikacijai:** serverless funkcijos daug kartų atidaro trumpas jungtis, o Postgres turi ribotą tiesioginių jungčių skaičių. Neon pooler (PgBouncer) jas multipleksuoja ant nedaugelio realių jungčių.
- **Transaction mode pasekmės:** PgBouncer transaction režime serverio jungtis priskiriama tik vienai transakcijai, todėl **negalima remtis sesijos būsena**: `SET`, `LISTEN/NOTIFY`, SQL lygio `PREPARE`. pgx numatytieji protokolo lygio prepared statements yra palaikomi, todėl pgx nustatymų nekeičiame. Migracijoms (pvz., advisory lock'ai, DDL) naudojame direct jungtį.
- **Gali paklausti:** „Kuo skiriasi pooled nuo direct?" – pooled = daug trumpų klientų jungčių → mažai serverio jungčių, bet be sesijos būsenos; direct = viena jungtis = viena sesija, tinka migracijoms. „Kodėl migracijų nevykdome per pooled?" – dėl sesijos būsenos/lock'ų apribojimų.

## `pkg/db` – vienas tingus connection pool ir jo nustatymai
- **Ką daro:** `db.Lazy` sukuria `pgxpool` **tik pirmą kartą panaudojus** (`sync.Once`) ir toliau naudoja tą patį visoms užklausoms. `Ping(ctx)` realizuoja `server.DBPinger` interfeisą. Jei `DATABASE_URL` nėra – grąžinama aiški klaida (be `panic`), funkcija nenulūžta.
- **Kodėl vienas paketo lygio pool'as:** Vercel gali pernaudoti „šiltą" funkcijos instanciją daugeliui užklausų. Jei pool'as gyvena instancijos kintamajame (`api/index.go` – `var router = ...`), nereikia jungtis atidarinėti iš naujo kiekvienai užklausai (TCP + TLS + auth kainuoja šimtus ms). „Tingus" – kad trūkstamas env kintamasis nenulaužtų viso paleidimo, o tik DB tikrinimą. Klaida įsimenama (`Once`), nes konfigūracijos klaida pati neišsitaiso be restart'o.
- **Nustatymai:**
  - `MaxConns = 4` – kiekviena šilta instancija turi savo pool'ą, o instancijų gali būti daug: bendras jungčių skaičius = instancijos × `MaxConns`. Mažas skaičius saugo Neon limitus.
  - `MaxConnIdleTime = 30s` – neaktyvios serverless instancijos „užšaldomos"; ilgai stovėjusi jungtis serverio pusėje tikriausiai jau mirusi. Trumpas idle laikas neleidžia tokioms jungtims likti ir sugadinti kitos užklausos.
  - `ConnectTimeout = 5s` (+ `context` timeout `Ping`'e) – viršutinė riba vienai naujai jungčiai atidaryti; Neon „cold start" gali užtrukti kelias sekundes, bet laukti amžinai negalima.
  - Kitus nustatymus (pvz., `QueryExecMode`) paliekame pgx numatytus – jie suderinami su PgBouncer.
- **Gali paklausti:** „Kodėl `sync.Once`, o ne `init()`?" – `init()` negali grąžinti klaidos ir nulaužtų visą funkciją, kai trūksta env. „Kas nutinka, jei instancija užšaldoma?" – jungtys miršta, todėl trumpas idle laikas. „Kodėl ne didesnis `MaxConns`?" – instancijos × pool dydis.

## Health handler ir `DBPinger` interfeisas (dependency injection)
- **Ką daro:** `server.DBPinger` yra mažas interfeisas (`Ping(ctx) error`). `NewRouter(Deps{DB: ...})` gauna priklausomybes parametrais; `api/index.go` ir `cmd/local` sukuria tas pačias priklausomybes (`db.NewLazy()`) ir perduoda. `GET /api/health` kviečia `Ping` su 5 s timeout ir grąžina atskirai API ir DB būseną.
- **Kodėl interfeisas:** handler'is nežino apie `pgxpool` – jam reikia tik „ar DB atsako". Todėl testuose įdedame netikrą `fakePinger` ir tikrinome 200/503 be realios duomenų bazės. Taip pat lengva vėliau keisti driver'į. Jokių globalių kintamųjų handler'iuose – viskas matoma iš `NewRouter` parametrų.
- **Kodėl 5 s timeout:** užtenka Neon „cold start" išgyventi, bet neleidžia užklausai kabėti amžinai.
- **Gali paklausti:** „Kaip testuoji be DB?" – `httptest` + `fakePinger`. „Kodėl interfeisas apibrėžtas handler'io pakete, o ne `db`?" – Go principas: interfeisą apibrėžia vartotojas (consumer), ne tiekėjas; `db.Lazy` jo net nežino, tik atitinka jį struktūriškai.

## Kodėl 503 ir kodėl klaidos tekstas neina klientui
- **Ką daro:** DB neprieinama arba nesukonfigūruota → `503 {"status":"error","db":"error"}`. Tikra klaida užrašoma tik į serverio log'ą.
- **Kodėl 503, o ne 500:** pats API veikia, nepasiekiama priklausomybė (DB) – tai „Service Unavailable"; būtent to tikisi monitoringas ir load balancer'iai. Frontend'as pagal tai atskiria „API: ok · DB: error" nuo „API: error".
- **Kodėl klaida paslėpta:** driver'io klaidos gali turėti host'ą, vartotojo vardą ar jungties eilutės dalis – tai informacija užpuolikui. Todėl `pkg/db` grąžina bendrines klaidas (be originalaus `err`, kai jis galėtų turėti URL), o testas tikrina, kad atsakyme nėra slaptų fragmentų.
- **Gali paklausti:** „Ką loginame?" – tik tai, kas reikalinga diagnozei, niekada jungties eilutės ar slaptažodžio. „Kodėl `dbLatencyMs` rodomas tik sėkmės atveju?" – klaidos atveju latency beprasmis; naudojame `*int64` + `omitempty`, kad tikras `0` ms nedingtų.

## Kodėl `godotenv` tik `cmd/*` įrankiuose (`cmd/local`, `cmd/migrate`)
- **Ką daro:** `cmd/local/main.go` įkelia `.env` iš repo šaknies. Jau nustatyti proceso aplinkos kintamieji turi pirmenybę prieš `.env`. Jei failo nėra – serveris vis tiek startuoja (health grąžins 503).
- **Kodėl tik čia:** Vercel kintamuosius paduoda iš projekto nustatymų (Production / Preview), todėl `.env` skaitymas `api/` ar `pkg/` būtų nereikalingas ir keistų elgseną tarp aplinkų. `pkg/` lieka švarus nuo „dev patogumų", o `.env` niekada nepatenka į production kodo kelią.
- **Gali paklausti:** „Kaip veikia lokali vs. Vercel konfigūracija?" – lokaliai `.env` (Neon `dev` šaka), Vercel Production – `main` šaka, Preview – `dev` šaka, nustatoma Vercel dashboard'e.

## Frontend: `apiFetch`, `useApi` ir „slow / waking up" signalas
- **Ką daro:** `src/api/client.ts` – `apiFetch<T>(path, options)`: viena funkcija visiems API kvietimams. Parsina JSON, ne-2xx atveju meta tipizuotą `ApiError` (`code`: `http` / `network` / `timeout` / `parse`, `status`, `body`), nutraukia užklausą po 15 s. `src/api/useApi.ts` – hook'as `useApi<T>(path)` grąžina `{ data, error, loading, slow, retry }`.
- **Kaip veikia `slow`:** hook'as paleidžia `setTimeout(1500 ms)`. Jei užklausa tuo metu dar vykdoma, `slow = true` ir UI rodo „Waking up the server…" (Neon pabunda po pauzės). Kai užklausa baigiasi, komponentas išmontuojamas ar paspaudžiamas Retry, timeout'as išvalomas (`cleanup`), o užklausa nutraukiama per `AbortController`.
- **Kodėl hook'as, o ne `apiFetch` dalis:** `slow` yra UI būsena, priklausanti nuo laikmačio ir komponento gyvavimo ciklo; `apiFetch` lieka paprasta funkcija be React priklausomybių (galima naudoti ir ne komponentuose). `retry` tiesiog padidina skaitiklį, kuris perleidžia `useEffect`.
- **Kodėl `ApiError.body`:** health endpoint'as 503 atveju grąžina JSON su `db: "error"`. `App` pagal tai parodo „API: ok · DB: error"; jei užklausa visai nepavyko (tinklas, timeout, tuščias atsakas) – „API: error".
- **Gali paklausti:** „Kodėl 1.5 s ir 15 s?" – 1.5 s greitas, bet dar nesuveikia normalioms užklausoms; 15 s – ilgiau nei Neon cold start. „Ką daro cleanup `useEffect`'e?" – nutraukia užklausą ir laikmatį, kad neatnaujintume būsenos išmontuoto komponento (taip pat svarbu React StrictMode, kuris dev režime efektą paleidžia du kartus). „Kaip ištestavai?" – headless Edge per DevTools protokolą: patikrinti „Checking… → Waking up… → ok", DB error + Retry, API down.

## Frontend (`src/App.tsx`, `vite.config.ts`)
- **Ką daro:** `App` naudoja `useApi("/api/health")` ir rodo: „Checking…" / „Waking up the server…" / „API: ok · DB: ok (NN ms)" / „API: ok · DB: error" arba „API: error" su **Retry** mygtuku. `vite.config.ts` turi dev proxy `/api` → `http://localhost:8080`.
- **Kodėl proxy:** naršyklė kalba tik su Vite portu, todėl nėra CORS problemų. Production'e frontend ir API yra tame pačiame domene.

## Kas yra migracija, kodėl numeruoti failai ir kodėl goose
- **Ką daro:** migracija – SQL failas, kuris pakeičia DB schemą (sukuria lentelę, prideda stulpelį). Failai `migrations/` kataloge numeruojami iš eilės (`00001_extensions.sql`, `00002_...`). Kiekvienas turi dvi dalis: `-- +goose Up` (pritaikyti) ir `-- +goose Down` (atšaukti). goose DB lentelėje `goose_db_version` įsimena, kurios migracijos jau pritaikytos, todėl `up` vykdo tik naujas.
- **Kodėl numeruoti:** tvarka svarbi (lentelė turi egzistuoti prieš tai, kai į ją rodo foreign key), o numeris ją fiksuoja ir leidžia visose aplinkose (dev, production) pasiekti tą pačią schemą tais pačiais žingsniais. Schema tampa versijuojama kaip kodas ir matoma git istorijoje.
- **Kodėl goose:** mažas, paprastas, SQL pirmiausia (rašome tikrą SQL, ne ORM), turi Go biblioteką (`Provider` API), todėl galime įdėti jį į savo `cmd/migrate` ir pridėti saugiklius. Naudojame `Provider` API, ne senąjį globalų API – jis neturi globalios būsenos ir palaiko sesijos lock'ą.
- **Gali paklausti:** „Kas, jei migracija jau pritaikyta, o aš ją pakeičiu?" – goose to nepastebės (tikrina tik versijas), todėl **pritaikytų migracijų nekeičiame, pridedame naują**. „Kuo skiriasi `down` nuo `up`?" – `down` vykdo tik vieną žingsnį atgal. „Kodėl ne ORM auto-migrate?" – nenuspėjama, nėra peržiūros per PR, pavojinga production'e.

## Kodėl migracijos įdedamos į binarinį failą (`go:embed`)
- **Ką daro:** `migrations/embed.go` turi `//go:embed *.sql` ir eksportuoja `var FS embed.FS`. Kompiliuojant visi `.sql` failai tampa programos dalimi; `cmd/migrate` perduoda `migrations.FS` goose'ui.
- **Kodėl taip:** programa nepriklauso nuo darbinio katalogo ar failų diske – migracijos visada tos pačios versijos kaip ir kodas, kurį paleidžiame. Neįmanoma paleisti `migrate` su pasenusiais ar trūkstamais failais. Tas pats veikia lokaliai ir GitHub Actions.
- **Gali paklausti:** „Ką daro `//go:embed`?" – kompiliatoriaus direktyva, įdedanti failus į `embed.FS` kintamąjį kompiliavimo metu. „Kodėl atskiras paketas `migrations`?" – `go:embed` leidžia įdėti tik failus iš to paties katalogo ar žemiau, todėl `embed.go` turi gyventi šalia `.sql` failų.

## Advisory lock – nuo ko saugo
- **Ką daro:** `goose.WithSessionLocker(lock.NewPostgresSessionLocker())` – prieš vykdydamas migracijas goose paima Postgres *advisory lock* (programinį užraktą, kurį Postgres laiko vienai sesijai). Antras tuo pačiu metu paleistas `migrate` laukia, kol pirmasis baigs, o paskui mato „nothing to apply".
- **Nuo ko saugo:** kad dvi migracijos (pvz., du CI paleidimai arba CI + kažkieno ranka) neįvykdytų tų pačių SQL vienu metu – tai galėtų sukurti dublius, sugadinti `goose_db_version` ar palikti pusiau pritaikytą schemą. Patikrinta lokaliai: trys vienu metu paleisti `up` – pritaikė tik vienas, kiti du palaukė ir nieko nedarė. GitHub `concurrency` yra pirma apsauga, advisory lock – antra (ji veikia ir jei kas nors paleidžia iš kito kompiuterio).
- **Gali paklausti:** „Kuo advisory lock skiriasi nuo lentelės lock'o?" – jis neužrakina duomenų, tik tai, ką pats susitariame tikrinti; veikia sesijos lygiu. „Kas, jei procesas nulūžta?" – kai sesija nutrūksta, Postgres lock'ą atlaisvina pats.

## Kodėl migracijoms direct, o ne pooled jungtis
- **Ką daro:** `cmd/migrate` skaito `DATABASE_URL_DIRECT` ir **atsisako dirbti**, jei host'e yra `-pooler` (`checkDirectURL`, turi vienetinius testus: pooled → klaida, direct → gerai, tuščias → klaida).
- **Kodėl taip:** pooled jungtis eina per PgBouncer *transaction mode*: serverio jungtis priskiriama tik vienai transakcijai, sesijos būsenos nėra. Advisory lock'as gyvena **sesijoje** – per pooler'į jis galėtų būti paimtas viena serverio jungtimi, o atleistas kita (arba išvis „pasimesti"), todėl apsauga nuo lygiagrečių migracijų neveiktų. Be to, DDL ir ilgos transakcijos geriau dirba su viena nuolatine jungtimi. Saugiklis padaro klaidą neįmanomą netyčia (pvz., įklijavus ne tą eilutę).
- **Gali paklausti:** „Kuo skiriasi `DATABASE_URL` ir `DATABASE_URL_DIRECT`?" – pirmas aplikacijai (pooled), antras migracijoms (direct), antro niekada nededame į Vercel. „Kodėl tikrinti host'ą, o ne tiesiog bandyti?" – per pooler'į dalis dalykų veiktų „beveik", ir klaida išlįstų tik retu momentu; geriau sustoti iš karto su aiškia žinute.

## Kodėl production migruojamas tik iš CI ir kodėl host'as niekada nespausdinamas
- **Ką daro:** `.github/workflows/migrate-production.yml` paleidžia `go run ./cmd/migrate up` po merge į `main` (kai pasikeitė `migrations/**` ar `cmd/migrate/**`) arba rankiniu „Run workflow" mygtuku. Connection string ateina iš GitHub secret `PROD_DATABASE_URL_DIRECT`. `concurrency` neleidžia dviem paleidimams dirbti kartu (`cancel-in-progress: false` – pradėto neprarandame pusiaukelėje). `permissions: contents: read` – darbas gali tik skaityti repo. Jei secret'o nėra – darbas baigiasi aiškia žinute, ne painia driver'io klaida. Actions pinned prie commit SHA (tag'us autorius gali nepastebimai perkelti – supply-chain ataka).
- **Kodėl tik iš CI:** production slaptažodis nėra ant mano kompiuterio (jokio „netyčia paleidau prieš production"); kiekvienas pakeitimas praeina PR peržiūrą; matomas žurnalas, kas ir kada paleido; visada vienodas Go ir kodo versijos kontekstas.
- **Kodėl host'as/vartotojas/slaptažodis niekada nespausdinami:** repo viešas, todėl Actions žurnalai viešai matomi. GitHub užmaskuoja tik **visą** secret reikšmę – jos dalys (pvz., tik host'as ar vartotojo vardas) nebūtų užmaskuotos. Todėl `cmd/migrate` spausdina tik bendrines klaidas ir papildomai (`safeMessage`) išvalo iš klaidų tekstų host'ą, vartotoją, slaptažodį ir IP. Pastaba: pgx klaidos įprastai turi `host=... user=...`, todėl prisijungimo klaidos išvis rodomos tik bendra žinute.
- **Gali paklausti:** „Kaip paleisti migraciją production'e?" – merge į `main` arba Actions → Migrate production → Run workflow. „Kas, jei CI nepavyko?" – žiūrime žurnalą (jis be slaptų duomenų), taisome nauja migracija PR'e. „Kodėl goose ne 1.26?" – naujausias goose pakėlė `go` direktyvą iki 1.26, o Vercel Go 1.25 patikrintas; todėl užfiksuota `v3.27.0`.

## Expand / contract – kodėl migracijos turi būti atgal suderinamos
- **Ką daro (principas):** schemą keičiame dviem etapais. *Expand:* pridedame naują (stulpelį/lentelę) taip, kad **sena** kodo versija toliau veiktų. Vėliau, kai visas kodas jau naudoja naują, *contract:* kita migracija pašalina seną.
- **Kodėl taip:** Vercel deploy ir production migracija vyksta **vienu metu** – trumpai (sekundes ar minutes) veikia sena kodo versija su nauja schema arba atvirkščiai. Jei migracija ištrina ar pervadina stulpelį, kurį sena versija dar skaito, naudotojai gaus 500 klaidas. Pvz., pervadinimas = 1) pridėti naują stulpelį, rašyti į abu, 2) perjungti skaitymą, 3) tik tada ištrinti seną.
- **Gali paklausti:** „Ar galima pervadinti stulpelį viena migracija?" – ne, jei sena versija jį dar naudoja; skaidome į kelis deploy'us. „Kam `down`?" – patogu lokaliai ir kaip dokumentacija, bet production'e problemas taisome nauja pirmyn einančia migracija, ne `down`.
