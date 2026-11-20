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

## Duomenų modelis (`docs/DATA_MODEL.md`) ir migracija `00002_catalog.sql`
- **Ką daro:** `docs/DATA_MODEL.md` aprašo **visą** schemą (katalogas + planuojamos auth ir commerce lentelės): ER diagrama, kiekvienos lentelės stulpeliai su priežastimis, būsenų mašinos, SQL užklausų eskizai. Migracija `00002_catalog.sql` sukuria tik katalogo lenteles: `platforms`, `regions`, `games`, `products`, `sellers`, `offers`, `keys`. `users`/`sessions` atsiras auth užduotyje, `orders`/`order_items`/`payments` ir `keys.order_item_id` – checkout užduotyje (P7).
- **Kodėl taip:** schemą suprojektavus visą iš karto, katalogo lentelės jau dabar „žino", kaip prie jų prisijungs užsakymai (pvz., `keys` būsenos ir `reserved_until`), bet nekuriame lentelių, kurių kodas dar nenaudoja. Naujos lentelės = atgal suderinama migracija (expand).
- **Bendros taisyklės:** pinigai – `integer` centais (EUR); ID – `bigint GENERATED ALWAYS AS IDENTITY` (numerius skiria DB, rankinis ID įterpimas atmetamas, todėl seed'ai remiasi slug'ais); visi laikai `timestamptz` su `now()`; visi FK `ON DELETE RESTRICT`. **Kiekvienas** slug (`platforms`, `regions`, `games`, `products`, `sellers`) turi tą patį formato CHECK, o kiekvienas privalomas tekstas (pavadinimai, `title`, `edition`, `code`) – CHECK `btrim(x) <> ''` („ne tuščias"), nes `NOT NULL` vis tiek leidžia `''` ar `'   '`. Išimtis – `games.description`, kur `''` sąmoningai reiškia „nėra aprašymo".
- **Gali paklausti:** „Kodėl `btrim`?" – kad ir tarpų eilutė būtų laikoma tuščia. „Kodėl `bigint`, o ne `serial`?" – identity yra SQL standartas, `serial` – senesnis Postgres būdas; `GENERATED ALWAYS` neleidžia netyčia įrašyti savo ID ir išderinti sekos. „Kodėl `orders.id` bus UUID?" – jis matomas URL'e: neatspėjamas ir neparodo, kiek užsakymų yra.

## Lentelės `platforms` ir `regions`
- **Ką daro:** filtrų reikšmių sąrašai (PC, PlayStation 5 … / Global, Europe …): `slug` (URL'ui, unikalus), `name` (rodymui), `sort_order` (tvarka filtre).
- **Kodėl taip:** `slug` turi CHECK `^[a-z0-9]+(-[a-z0-9]+)*$` – tik mažosios raidės, skaitmenys ir pavieniai brūkšneliai, todėl jis visada saugus URL'e (`?platform=ps5`). Skaitmenys leidžiami, nes jų reikia (`ps5`). `sort_order` – nes tvarka yra verslo sprendimas, ne abėcėlė.
- **Gali paklausti:** „Kodėl regionas yra produkto dalis?" – „Europe" raktas gali neaktyvuotis kitame regione, todėl tai skirtingi produktai su skirtingomis kainomis.

## Lentelė `games`
- **Ką daro:** žaidimas kaip toks – tai, kas vienoda visose platformose: pavadinimas, aprašymas, žanrai, išleidimo data, kūrėjas, leidėjas, viršelio URL.
- **Kodėl taip:** `description` NOT NULL su `''` – viena „nėra aprašymo" reikšmė, Go kode nereikia tikrinti NULL. `genres text[]` – tik rodymui (P6), filtruoti nereikia, todėl atskira lentelė būtų perteklinė. `release_date` yra `date` (tikslumas – diena) ir gali būti NULL (nežinoma). `cover_url` gali būti NULL: vaizdų šaltinis dar nenuspręstas, o frontend'as rodo sugeneruotą placeholder'į, kai URL nėra **arba** paveikslėlis neužsikrauna – modelis veikia abiem atvejais.
- **Gali paklausti:** „Kodėl `games` ir `products` atskirai?" – vienas žaidimas parduodamas keliais variantais (platforma × regionas × leidimas); aprašymas nekartojamas kiekvienam variantui.

## Lentelė `products`
- **Ką daro:** tai, ką pirkėjas renkasi: vienas žaidimas + viena platforma + vienas regionas + vienas leidimas (`edition`, numatytai `Standard`), su savo `slug` (pvz., `the-witcher-3-pc-global`).
- **Kodėl taip:** UNIQUE `(game_id, platform_id, region_id, edition)` neleidžia sukurti to paties varianto du kartus (kitaip pasiūlymai išsiskirstytų per du „vienodus" puslapius). Jo pirmas stulpelis `game_id` kartu tarnauja kaip indeksas „visi žaidimo produktai". Atskiri indeksai `platform_id` ir `region_id` – parduotuvės filtrams (kiekvienas filtras gali būti naudojamas vienas; Postgres juos moka sujungti).
- **Gali paklausti:** „Kodėl `edition` tekstas, o ne lentelė?" – leidimų pavadinimai skiriasi kiekvienam žaidimui, filtruoti pagal juos nereikia.

## Lentelė `sellers`
- **Ką daro:** pardavėjai: `name`, `slug`, `positive_feedback_pct` (pvz., 99,4 %), `reviews_count`.
- **Kodėl taip:** `numeric(4,1)` – tiksli dešimtainė reikšmė rodymui, daugiausia `100.0`; CHECK 0–100. Tai ne pinigai, todėl `numeric` čia tinka. `positive_feedback_pct` gali būti **NULL** – naujas pardavėjas dar neturi įvertinimo, UI rodo „New seller" (0 % būtų melas). `reviews_count` CHECK ≥ 0.
- **Gali paklausti:** „Kodėl ne `float`?" – `float` gali rodyti 99.40000001; `numeric` saugo tiksliai tai, ką įrašėme. „Ar CHECK 0–100 praleidžia NULL?" – taip: CHECK atmeta tik kai sąlyga `false`, o su NULL ji yra `NULL` (nežinoma), todėl eilutė priimama.

## Lentelė `offers`
- **Ką daro:** vieno pardavėjo kaina vienam produktui (`price_cents`), `is_active` (pardavėjas gali pristabdyti pasiūlymą), `created_at`/`updated_at`.
- **Kodėl taip:** `price_cents` CHECK > 0 – nemokama ar neigiama kaina visada yra klaida. UNIQUE `(product_id, seller_id)` – pardavėjas keičia kainą, o ne kuria antrą pasiūlymą. Dalinis indeksas `(product_id, price_cents) WHERE is_active` tiksliai atitinka produkto puslapio užklausą „aktyvūs pasiūlymai, pigiausias pirmas" – patikrinta, kad Postgres grąžina eilutes iš indekso jau surikiuotas (be atskiro Sort). Neaktyvių pasiūlymų parduotuvė neskaito, todėl jų indekse nėra. `seller_id` atskiro indekso sąmoningai neturi (nėra „pardavėjo pasiūlymų" puslapio).
- **Trigeris `offers_set_updated_at`:** `BEFORE UPDATE ... FOR EACH ROW` kviečia funkciją `set_updated_at()`, kuri prieš įrašant eilutę nustato `NEW.updated_at := now()`. Taip `updated_at` visada teisingas, net jei kuri nors užklausa ar rankinis SQL to „pamirštų". Funkcija bendra – vėliau ją naudos ir `orders`. Patikrinta: po `UPDATE` senas `updated_at` (2000-01-01) pasikeitė į `now()`.
- **Gali paklausti:** „Kodėl pasiūlymo neištrinate?" – vėliau į jį rodys užsakymai (RESTRICT), todėl išjungiame `is_active = false`. „Kodėl `BEFORE`, o ne `AFTER` trigeris?" – tik `BEFORE` trigeris gali pakeisti įrašomą eilutę (`NEW`). „Kodėl migracijoje `-- +goose StatementBegin/End`?" – funkcijos kūne yra `;`, o goose kitaip skaldytų SQL per kabliataškius.

## Lentelė `keys`
- **Ką daro:** vienas aktyvacijos kodas. `status`: `available` / `reserved` / `sold`; `reserved_until` – iki kada rezervuotas; `sold_at` – kada parduotas. Vėliau bus `order_item_id`.
- **Kodėl taip:** CHECK'ai daro neįmanomas būsenas neįrašomas: `reserved_until` nustatytas **tada ir tik tada**, kai `status = 'reserved'`; `sold_at` – tada ir tik tada, kai `sold`. UNIQUE `(offer_id, code)` – tas pats kodas į pasiūlymą neįkeliamas du kartus. Dalinis indeksas `(offer_id, reserved_until) WHERE status <> 'sold'` laiko tik **neparduotus** raktus: „parduodamas" = `available` arba `reserved` su pasibaigusiu laiku. `now()` negalima naudoti indekso sąlygoje (ji turi būti nekintama), todėl galiojimą tikrina užklausa pagal `reserved_until`, kuris yra antras indekso stulpelis – todėl atsargų skaičiavimas yra *index-only scan* (patikrinta). Parduoti raktai (laikui bėgant – dauguma) indekse nelaikomi, todėl jis lieka dabartinių atsargų dydžio.
- **Būsenų mašina:** `available → reserved → sold`; `reserved → available`, kai užsakymas nepavyksta; pasibaigusi rezervacija tiesiog vėl skaitoma kaip laisva.
- **Gali paklausti:** „Kodėl `text + CHECK`, o ne enum?" – tos pačios priežastys kaip P1. „Ar kodai saugomi atvirai?" – čia taip; production'e būtų šifruojami (žr. DATA_MODEL skyrių „What a production system would do differently").

## P1 – lookup lentelės, o ne Postgres `enum`
- **Ką daro:** platformos ir regionai yra atskiros lentelės (`slug` + `name` + `sort_order`), o produktas į jas rodo FK.
- **Kodėl taip:** naują platformą pridedame `INSERT`'u, be migracijos; enum reikšmės sunkiai pašalinamos ar pervadinamos; lentelė kartu laiko rodomą pavadinimą ir tvarką. FK garantuoja, kad produktas negali rodyti į neegzistuojančią platformą.
- **Gali paklausti:** „Ar enum nebūtų greitesnis?" – keliasdešimties eilučių lentelės JOIN kainuoja praktiškai nieko; lankstumas svarbesnis.

## P2 – atsargos ir pigiausia kaina skaičiuojamos, ne saugomos
- **Ką daro:** atsargos = parduodamų raktų skaičius (`count`). Kaina parduotuvės sąraše = `MIN(price_cents)` tarp aktyvių pasiūlymų, **kurie turi atsargų** (`min(...) FILTER (WHERE has_stock)`). Jei tokių nėra – kaina `NULL`, produktas rodomas kaip „Out of stock", rikiuojant pagal kainą eina paskutinis (`NULLS LAST`) ir neįtraukiamas, kai nustatytas kainos filtras (`NULL >= 1000` nėra `true`). Jokių `stock` ar `min_price` stulpelių.
- **Kodėl taip:** saugoma išvestinė reikšmė gali išsiderinti (pamiršome atnaujinti, dvi transakcijos vienu metu) – tada parduotuvė meluoja. Skaičiuojant visada teisinga. Mūsų mastu tai pigu, nes yra tinkami indeksai.
- **Gali paklausti:** „Kodėl kainai neskaičiuoti pasiūlymo be atsargų?" – kortelė rodytų kainą, už kurią nupirkti neįmanoma. „O kai bus milijonai prekių?" – tada cache'intume (`product_stats` lentelė ar materialized view, atnaujinama įvykiais, arba paieškos variklis) – aprašyta DATA_MODEL production skyriuje.

## P3 – rezervacija su galiojimo laiku, be cron
- **Ką daro:** rezervuojant raktą `reserved_until = now() + 15 min` (15 minučių – nuspręsta). Visos „parduodamų raktų" užklausos sąlygą rašo kaip `status <> 'sold' AND (reserved_until IS NULL OR reserved_until < now())` – pasibaigusi rezervacija automatiškai laikoma laisva.
- **Kodėl taip:** nereikia foninio darbo (Vercel serverless jo patogiai nepaleistų), ir nėra lango, kai raktas „užstrigęs", nes cron dar nesuveikė. Kitas pirkėjas tiesiog paima pasibaigusį raktą ir perrašo `reserved_until`.
- **Kas apsaugo seną užsakymą?** Raktas priklauso užsakymo eilutei (`order_item_id`, checkout užduotyje). Mokėjimas priimamas tik iki `expires_at`, o raktai parduodami su `WHERE order_item_id = ... AND status = 'reserved'`; jei kažkas spėjo raktą perimti – eilučių mažiau, transakcija atšaukiama, užsakymas `expired`.
- **Gali paklausti:** „Kas, jei pirkėjas sumoka po 15 min?" – mokėjimas atmetamas, užsakymas `expired`, svetimas raktas niekada neparduodamas.

## P5 – sesijose saugomas token'o hash'as
- **Ką daro (planuojama):** slapukas turi atsitiktinį 32 baitų token'ą, o `sessions.token_hash` – tik jo SHA-256. Užklausos metu serveris suskaičiuoja hash'ą ir ieško `WHERE token_hash = $1`.
- **Kodėl taip:** jei nutekėtų DB ar atsarginė kopija, užpuolikas gautų tik hash'us, kurių negalima naudoti kaip slapuko. SHA-256 (ne bcrypt), nes token'as yra atsitiktinis, ne spėjamas slaptažodis – greitas hash'as saugus; be to, reikia ieškoti pagal tikslią reikšmę, o „sūdytas" bcrypt to neleidžia.
- **Gali paklausti:** „Kodėl ne JWT?" – serverio sesiją galima iš karto atšaukti (logout ištrina eilutę), JWT – ne iki galiojimo pabaigos.

## Planuojami užsakymai: snapshot'ai ir krepšelis naršyklėje
- **Ką daro (planuojama, checkout užduotis):** `order_items` saugo pirkimo momento kopiją: `product_title`, `seller_name` ir `unit_price_cents`. Krepšelio lentelės DB nėra – krepšelis gyvena naršyklėje, o checkout metu frontend'as siunčia `(offer_id, quantity)` sąrašą.
- **Kodėl taip:** užsakymas yra istorinis/finansinis įrašas – jis turi atrodyti taip pat ir po to, kai pardavėjas pakeičia kainą, pervadinamas ar katalogo pavadinimas pasikeičia. Krepšelis naršyklėje – mažiau lentelių ir endpoint'ų; serveris vis tiek iš naujo nuskaito kainas iš `offers` (klientu nepasitikime).
- **Gali paklausti:** „Kodėl ne tiesiog JOIN į `offers`/`sellers`?" – JOIN rodytų **dabartinę** kainą ir vardą, ne tą, už kurią sumokėta. „Kas, jei vartotojas pakeičia kainą naršyklėje?" – nesvarbu: kaina imama iš DB checkout metu.

## Trigram indeksas (`games_title_trgm_idx`)
- **Ką daro:** `CREATE INDEX ... ON games USING gin (title gin_trgm_ops)`. `pg_trgm` skaido tekstą į 3 raidžių gabalus; panašūs tekstai turi daug bendrų gabalų, todėl „witchr" randa „Witcher".
- **Kodėl GIN + `gin_trgm_ops` ant paprasto `title`:** ši operatorių klasė aptarnauja **ir** `ILIKE '%witcher%'` (dalinis atitikimas), **ir** panašumo operatorius `%`, `<%` (rašybos klaidos) – patikrinta `EXPLAIN`: abi sąlygos naudoja tą patį indeksą (`BitmapOr`). GIN skaito greičiau nei GiST; GiST privalumas (rikiavimas pagal atstumą `<->`) mums nereikalingas – kelis rastus įrašus surikiuojame pagal `word_similarity()`. `lower(title)` nereikia: `pg_trgm` pats mažina raides, o `ILIKE` ir taip nejautrus raidžių dydžiui.
- **Gali paklausti:** „Ar `similarity()` funkcija naudoja indeksą?" – ne, indeksą naudoja tik operatoriai (`%`, `<%`); funkcija tinka rikiavimui. „Kaip pakeisti slenkstį?" – `SET` per PgBouncer transaction mode neišlieka, todėl reikėtų `SET LOCAL` transakcijos viduje.

## `FOR UPDATE SKIP LOCKED` – raktų rezervavimas
- **Ką daro:** checkout transakcijoje parenkami N parduodamų raktų su `FOR UPDATE SKIP LOCKED` ir tame pačiame sakinyje pažymimi `reserved`. Jei grįžo mažiau nei N – `ROLLBACK` ir „nepakanka atsargų".
- **Kodėl taip:** `FOR UPDATE` užrakina pasirinktas eilutes iki transakcijos pabaigos – du pirkėjai niekada negauna to paties rakto. `SKIP LOCKED` – antras pirkėjas tuo pačiu metu **nelaukia**, o praleidžia užrakintas eilutes ir ima kitus laisvus raktus; be jo visi populiaraus pasiūlymo pirkėjai stovėtų eilėje prie tų pačių eilučių. Po užrakinimo Postgres dar kartą patikrina `WHERE` naujausiai eilutės versijai, todėl ką tik kito rezervuotas raktas nepaimamas.
- **Gali paklausti:** „Kodėl ne `SELECT count(*)` ir paskui `UPDATE`?" – tarp jų kita transakcija gali paimti tuos pačius raktus (race condition). „Kodėl ne `SERIALIZABLE`?" – veiktų, bet konfliktai baigtųsi klaidomis ir pakartojimais; `SKIP LOCKED` tiesiog paima kitus raktus.

## Kodėl `ON DELETE RESTRICT`, o ne `CASCADE`
- **Ką daro:** visi FK yra `RESTRICT`: negalima ištrinti žaidimo, kuris turi produktų, pasiūlymo, kuris turi raktų, ir t. t. (patikrinta: `DELETE FROM games` atmetamas su klaida `23001 restrict_violation`).
- **Kodėl taip:** `CASCADE` vieną klaidingą `DELETE` paverstų tyliu produktų, pasiūlymų, raktų, o vėliau ir užsakymų istorijos praradimu. Naudojamus duomenis „išimame" aiškiai (pvz., `is_active = false`). Vienintelė išimtis (nuspręsta, bus auth užduotyje) – `sessions → users` su `CASCADE`, nes sesijos yra vienkartinė prisijungimo būsena, ne istorija.
- **Gali paklausti:** „Kuo `RESTRICT` skiriasi nuo numatyto `NO ACTION`?" – `RESTRICT` tikrina iš karto, `NO ACTION` patikrinimą galima atidėti iki transakcijos pabaigos (`DEFERRABLE`); mums reikia griežto varianto.

## Kodėl CHECK apribojimai duomenų bazėje, o ne tik Go kode
- **Ką daro:** taisyklės (`price_cents > 0`, leistinos `status` reikšmės, `reserved_until` tik kai `reserved`, slug formatas visuose slug'uose, ne tušti pavadinimai/kodai, 0–100 %) aprašytos pačioje schemoje.
- **Kodėl taip:** Go validacija bus (draugiškoms klaidų žinutėms), bet DB yra paskutinė apsaugos linija: ji saugo ir nuo seed skriptų, rankinio SQL Neon konsolėje, būsimų endpoint'ų ir klaidų kode. Netinkama eilutė tiesiog negali egzistuoti, todėl kiekvienas skaitytojas gali pasitikėti duomenimis. Patikrinta testu: 21 netinkamas įrašas atmestas su tiksliu apribojimo pavadinimu.
- **Gali paklausti:** „Ar tai nedubliuoja logikos?" – iš dalies taip, bet tikslai skirtingi: Go – patogi žinutė vartotojui, DB – garantija. „Kodėl apribojimai turi vardus?" – klaidoje matosi, kuri taisyklė pažeista (`offers_price_positive`), lengviau derinti.
