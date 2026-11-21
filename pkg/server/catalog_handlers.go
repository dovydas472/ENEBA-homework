package server

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
	"github.com/dovydas472/ENEBA-homework/pkg/db"
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

// requestTimeout bounds one request's database work: Neon cold start and the
// single connect retry included (the arithmetic is in pkg/db/retry.go).
const requestTimeout = db.RequestTimeout

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
	log.Printf("catalog: %s failed (database unavailable): %v", what, err)
	writeError(w, http.StatusServiceUnavailable, "service temporarily unavailable")
}

// internalError answers 500 with a generic message (real error: log only).
func internalError(w http.ResponseWriter, what string, err error) {
	log.Printf("catalog: %s failed (unexpected error): %v", what, err)
	writeError(w, http.StatusInternalServerError, "internal error")
}

// storeFailed picks the status for an error that came from the store:
//   - 503: the database cannot be reached (connection, pool or config problem).
//     Infrastructure is at fault; retrying later usually helps.
//   - 500: anything else, e.g. a SQL error. That is a bug in our code, a
//     developer has to fix it; retrying will not help.
func storeFailed(w http.ResponseWriter, what string, err error) {
	if db.IsUnavailable(err) {
		unavailable(w, what, err)
		return
	}
	internalError(w, what, err)
}

// productsHandler serves GET /api/products: one page of the store listing plus
// the facets for the same filters.
//   - invalid query -> 400 with a clear message (nothing is silently ignored)
//   - DB unreachable -> 503 generic; any other store error -> 500 generic
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

		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		page, err := c.ListProducts(ctx, filter)
		if err != nil {
			storeFailed(w, "list products", err)
			return
		}
		writeCached(w, http.StatusOK, cacheList, page)
	}
}

// productHandler serves GET /api/products/{slug}: the product page data.
// An unknown slug is a 404; an unreachable database is a generic 503, any other store error a generic 500.
func productHandler(c CatalogReader) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c == nil {
			unavailable(w, "get product", errors.New("no catalog configured"))
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		detail, err := c.GetProduct(ctx, r.PathValue("slug"))
		if errors.Is(err, catalog.ErrNotFound) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}
		if err != nil {
			storeFailed(w, "get product", err)
			return
		}
		writeCached(w, http.StatusOK, cacheProduct, detail)
	}
}
