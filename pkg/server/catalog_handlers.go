package server

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

// Cache-Control values (decided by the owner). The Vercel CDN may serve a
// stored copy for s-maxage seconds without calling the function, and for the
// following stale-while-revalidate seconds it serves the old copy while it
// fetches a fresh one in the background.
//
// Short staleness is safe because the catalog is only for BROWSING: checkout
// (a later task) re-checks stock and price in the database before it takes
// money, so a 60 s old price on a card can never cause a wrong charge.
const (
	cacheList    = "public, s-maxage=60, stale-while-revalidate=300"
	cacheProduct = "public, s-maxage=15, stale-while-revalidate=60"
)

// catalogTimeout bounds one request's database work (Neon cold start included).
const catalogTimeout = 8 * time.Second

// CatalogReader is everything the catalog handlers need from the data layer.
// Like DBPinger, it is a small interface: handlers do not know about pgx, and
// tests plug in a fake that returns canned data or errors.
// *catalog.Store implements it.
type CatalogReader interface {
	ListProducts(ctx context.Context, f catalog.Filter) (catalog.Page, error)
	GetProduct(ctx context.Context, slug string) (catalog.ProductDetail, error)
}

// unavailable answers 503 with a generic message. The real error is only logged:
// it may contain SQL, table names or connection details.
func unavailable(w http.ResponseWriter, what string, err error) {
	log.Printf("catalog: %s failed: %v", what, err)
	writeError(w, http.StatusServiceUnavailable, "service temporarily unavailable")
}

// productsHandler serves GET /api/products: one page of the store listing plus
// the facets for the same filters.
//   - invalid query -> 400 with a clear message (nothing is silently ignored)
//   - DB problem    -> 503 generic
//   - success       -> 200, cacheable at the edge for a short time
func productsHandler(c CatalogReader) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filter, err := parseListQuery(r.URL.Query())
		if err != nil {
			// parseListQuery's messages are written for the client, so they are safe to return.
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if c == nil {
			unavailable(w, "list products", errors.New("no catalog configured"))
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), catalogTimeout)
		defer cancel()
		page, err := c.ListProducts(ctx, filter)
		if err != nil {
			unavailable(w, "list products", err)
			return
		}
		writeCached(w, http.StatusOK, cacheList, page)
	}
}

// productHandler serves GET /api/products/{slug}: the product page data.
// An unknown slug is a 404; every other store error is a generic 503.
func productHandler(c CatalogReader) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c == nil {
			unavailable(w, "get product", errors.New("no catalog configured"))
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), catalogTimeout)
		defer cancel()
		detail, err := c.GetProduct(ctx, r.PathValue("slug"))
		if errors.Is(err, catalog.ErrNotFound) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}
		if err != nil {
			unavailable(w, "get product", err)
			return
		}
		writeCached(w, http.StatusOK, cacheProduct, detail)
	}
}
