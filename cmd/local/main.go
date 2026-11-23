// Command local runs the SAME router as the Vercel function on 127.0.0.1:8080,
// so the Go API can be developed without the Vercel CLI.
//
//	go run ./cmd/local             # http://127.0.0.1:8080
//	go run ./cmd/local -port 8092  # another port, e.g. next to an older server
package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"

	"github.com/joho/godotenv"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
	"github.com/dovydas472/ENEBA-homework/pkg/db"
	"github.com/dovydas472/ENEBA-homework/pkg/homepage"
	"github.com/dovydas472/ENEBA-homework/pkg/orders"
	"github.com/dovydas472/ENEBA-homework/pkg/server"
)

// listenAddr is where the local API listens: always the loopback address 127.0.0.1, never ":port"
// (= every network interface). Only this computer can reach it, and Windows Firewall does not ask
// whether to open the port to the network.
func listenAddr(port int) (string, error) {
	if port < 1 || port > 65535 {
		return "", fmt.Errorf("port must be 1-65535, got %d", port)
	}
	return net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), nil
}

func main() {
	port := flag.Int("port", 8080, "TCP port on 127.0.0.1")
	flag.Parse()
	addr, err := listenAddr(*port)
	if err != nil {
		log.Fatal(err)
	}

	// Load .env from the repo root (run this from the repo root).
	// godotenv is used ONLY here: on Vercel the variables come from project
	// settings. Variables already set in the environment win over .env.
	// A missing file is fine - the API still starts, /api/health will report 503.
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("no .env loaded (%v) - using the process environment only", err)
	}

	lazyDB := db.NewLazy() // one pool, shared by health, the catalog and auth
	catalogData := catalog.NewStore(lazyDB)
	router := server.NewRouter(server.Deps{
		DB:       lazyDB,
		Catalog:  catalogData,
		Auth:     auth.NewStore(lazyDB),
		Orders:   orders.NewStore(lazyDB),
		Homepage: homepage.NewService(homepage.NewStore(lazyDB), catalogData), // the blocks reuse the catalog
	})

	log.Printf("local API listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, router))
}
