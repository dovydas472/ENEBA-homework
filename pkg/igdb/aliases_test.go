package igdb

import (
	"reflect"
	"strings"
	"testing"
)

func TestCleanAliases(t *testing.T) {
	tests := []struct {
		name  string
		title string
		in    []string
		max   int
		want  []string
	}{
		{"keeps useful names in order", "Grand Theft Auto V",
			[]string{"GTA V", "GTA 5"}, 10, []string{"GTA V", "GTA 5"}},
		{"trims and collapses spaces", "Half-Life 2",
			[]string{"  HL  2 "}, 10, []string{"HL 2"}},
		{"drops the title itself, case-insensitively", "Portal",
			[]string{"PORTAL", "portal "}, 10, []string{}},
		{"drops case-insensitive duplicates, keeps the first spelling", "Grand Theft Auto IV",
			[]string{"GTA IV", "gta iv", "GTA  IV"}, 10, []string{"GTA IV"}},
		{"drops non-Latin scripts", "The Witcher 3: Wild Hunt",
			[]string{"ウィッチャー3", "Ведьмак 3", "Witcher 3"}, 10, []string{"Witcher 3"}},
		{"keeps Latin letters with accents", "The Witcher 3: Wild Hunt",
			[]string{"Zaklínač 3"}, 10, []string{"Zaklínač 3"}},
		{"drops executable names", "Portal",
			[]string{"hl2.exe", "Portal2.EXE"}, 10, []string{}},
		{"drops empty names", "Doom",
			[]string{"", "   "}, 10, []string{}},
		{"caps the number", "Doom",
			[]string{"A1", "A2", "A3"}, 2, []string{"A1", "A2"}},
		{"never nil", "Doom", nil, 10, []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CleanAliases(tt.title, tt.in, tt.max)
			if got == nil || !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("CleanAliases(%q, %q) = %#v, want %#v", tt.title, tt.in, got, tt.want)
			}
		})
	}
}

func TestGroupAliasesSortsByID(t *testing.T) {
	got := GroupAliases([]APIAlternativeName{
		{ID: 3, Name: "third", Game: 1},
		{ID: 1, Name: "first", Game: 1},
		{ID: 2, Name: "other game", Game: 2},
	})
	want := map[int64][]string{1: {"first", "third"}, 2: {"other game"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("GroupAliases = %v, want %v", got, want)
	}
}

func TestAliasesQuery(t *testing.T) {
	q := AliasesQuery([]int64{1020, 1942}, 500)
	for _, part := range []string{"where game = (1020,1942);", "sort id asc;", "limit 500;", "offset 500;"} {
		if !strings.Contains(q, part) {
			t.Errorf("query %q does not contain %q", q, part)
		}
	}
}
