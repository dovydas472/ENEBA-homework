// Command local runs the SAME router as the Vercel function on :8080,
// so the Go API can be developed without the Vercel CLI.
package main

import (
	"log"
	"net/http"

	"github.com/joho/godotenv"

	"github.com/dovydas472/ENEBA-homework/pkg/db"
	"github.com/dovydas472/ENEBA-homework/pkg/server"
)

func main() {
	// Load .env from the repo root (run this from the repo root).
	// godotenv is used ONLY here: on Vercel the variables come from project
	// settings. Variables already set in the environment win over .env.
	// A missing file is fine - the API still starts, /api/health will report 503.
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("no .env loaded (%v) - using the process environment only", err)
	}

	router := server.NewRouter(server.Deps{DB: db.NewLazy()})

	addr := ":8080"
	log.Printf("local API listening on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, router))
}
