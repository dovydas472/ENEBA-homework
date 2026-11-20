package igdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	tokenURL   = "https://id.twitch.tv/oauth2/token"
	apiBaseURL = "https://api.igdb.com/v4/"
	// IGDB allows 4 requests per second. We make only a few, but still keep at
	// least this gap between two calls so a future loop cannot break the limit.
	minGap = 300 * time.Millisecond
)

// Client talks to Twitch (for the token) and to IGDB. It is used only by the
// local cmd/igdb-snapshot tool.
//
// SECURITY: the client id, the secret and the token are never put into a URL
// (Go's HTTP errors print the URL) and never into an error message.
type Client struct {
	HTTP     *http.Client
	clientID string
	token    string
	last     time.Time // time of the previous request (rate limit)
}

// NewClient returns a client with a sane timeout.
func NewClient(clientID string) *Client {
	return &Client{HTTP: &http.Client{Timeout: 30 * time.Second}, clientID: clientID}
}

// Authenticate gets an app access token with the OAuth 2.0 **client credentials**
// flow: our program proves who it is with its client id + secret (no user, no
// browser login) and receives a short-lived bearer token. The secret is sent in
// the POST body (form-encoded), not in the URL.
func (c *Client) Authenticate(ctx context.Context, clientSecret string) error {
	form := url.Values{
		"client_id":     {c.clientID},
		"client_secret": {clientSecret},
		"grant_type":    {"client_credentials"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return errors.New("cannot build the token request")
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	var out struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := c.do(req, &out); err != nil {
		return fmt.Errorf("Twitch token request failed: %w (check IGDB_CLIENT_ID / IGDB_CLIENT_SECRET)", err)
	}
	if out.AccessToken == "" {
		return errors.New("Twitch returned no access token")
	}
	c.token = out.AccessToken
	return nil
}

// Query sends one Apicalypse query (e.g. "fields name; limit 10;") to an IGDB
// endpoint ("games", "platforms" ...) and decodes the JSON array into out.
func (c *Client) Query(ctx context.Context, endpoint, query string, out any) error {
	if c.token == "" {
		return errors.New("not authenticated: call Authenticate first")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBaseURL+endpoint, strings.NewReader(query))
	if err != nil {
		return errors.New("cannot build the IGDB request")
	}
	req.Header.Set("Client-ID", c.clientID)
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "text/plain")
	if err := c.do(req, out); err != nil {
		return fmt.Errorf("IGDB %s query failed: %w", endpoint, err)
	}
	return nil
}

// do waits for the rate limit, sends the request and decodes a 2xx JSON answer.
// For a non-2xx answer it returns only the status code: the body could echo
// what we sent.
func (c *Client) do(req *http.Request, out any) error {
	if wait := minGap - time.Since(c.last); wait > 0 {
		time.Sleep(wait)
	}
	c.last = time.Now()

	resp, err := c.HTTP.Do(req)
	if err != nil {
		// The URL in this error contains no secret (they are in the body/headers).
		return fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10 MB is far more than we need
	if err != nil {
		return errors.New("cannot read the response")
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return errors.New("the response is not the expected JSON")
	}
	return nil
}
