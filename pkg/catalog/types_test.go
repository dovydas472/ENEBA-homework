package catalog

import (
	"encoding/json"
	"strings"
	"testing"
)

// GameID is internal (the home rows de-duplicate by it): the API response shape must not change.
func TestItem_gameIDIsNotSentToTheFrontend(t *testing.T) {
	b, err := json.Marshal(Item{GameID: 42, Slug: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if s := string(b); strings.Contains(strings.ToLower(s), "gameid") || strings.Contains(s, "42") {
		t.Errorf("Item JSON leaks the game id: %s", s)
	}
}
