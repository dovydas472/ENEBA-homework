package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/dovydas472/ENEBA-homework/pkg/homepage"
)

// cacheHomepage: the registry and every block (owner decision, Task 15). Home page content changes
// rarely, so the CDN may keep an answer for 5 minutes and then serve it for 10 more while it fetches a
// fresh one. Prices on the page may therefore be a few minutes old - checkout re-prices in the database.
// Consequence: in production, turning a block on or off is visible within about 5 minutes, without a deploy.
const cacheHomepage = "public, s-maxage=300, stale-while-revalidate=600"

// HomepageReader is everything the home page handlers need. *homepage.Service implements it;
// tests use a fake. Like CatalogReader it hides the database from the HTTP layer.
type HomepageReader interface {
	Registry(ctx context.Context) (homepage.Registry, error)
	Hero(ctx context.Context) (homepage.Hero, error)
	Tiles(ctx context.Context) (homepage.Tiles, error)
	Platforms(ctx context.Context) (homepage.Platforms, error)
	ProductRow(ctx context.Context, key string) (homepage.ProductRow, error)
}

// homepageHandler turns one HomepageReader method into an HTTP handler with the shared rules:
//   - block does not exist or is disabled -> 404 (never cached)
//   - DB unreachable -> 503 generic; any other error (e.g. a bad config in the table) -> 500 generic
//   - success -> 200 JSON, cacheable for 5 minutes
//
// `load` gets the request (a product row needs its {key}) and returns the value to send as JSON.
func homepageHandler(h HomepageReader, what string, load func(ctx context.Context, h HomepageReader, r *http.Request) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if h == nil {
			unavailable(w, what, errors.New("no homepage service configured"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		v, err := load(ctx, h, r)
		if errors.Is(err, homepage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "block not found")
			return
		}
		if err != nil {
			storeFailed(w, what, err)
			return
		}
		writeCached(w, http.StatusOK, cacheHomepage, v)
	}
}

func loadRegistry(ctx context.Context, h HomepageReader, _ *http.Request) (any, error) {
	return h.Registry(ctx)
}

func loadHero(ctx context.Context, h HomepageReader, _ *http.Request) (any, error) {
	return h.Hero(ctx)
}

func loadTiles(ctx context.Context, h HomepageReader, _ *http.Request) (any, error) {
	return h.Tiles(ctx)
}

func loadPlatforms(ctx context.Context, h HomepageReader, _ *http.Request) (any, error) {
	return h.Platforms(ctx)
}

func loadProductRow(ctx context.Context, h HomepageReader, r *http.Request) (any, error) {
	return h.ProductRow(ctx, r.PathValue("key"))
}
