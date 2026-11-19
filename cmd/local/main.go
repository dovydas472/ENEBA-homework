// Command local runs the SAME router as the Vercel function on :8080,
// so the Go API can be developed without the Vercel CLI.
package main

import (
	"log"
	"net/http"

	"github.com/dovydas472/ENEBA-homework/internal/server"
)

func main() {
	addr := ":8080"
	log.Printf("local API listening on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, server.NewRouter()))
}
