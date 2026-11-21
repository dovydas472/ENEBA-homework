package catalog

import "testing"

func TestRatingLabel(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	tests := []struct {
		name   string
		rating *float64
		want   string // "" = no label (nil)
	}{
		{"NULL = new seller has no label", nil, ""},
		{"10.00", f(10), "Superb"},
		{"exactly 9.75 is Superb", f(9.75), "Superb"},
		{"9.749 is only Excellent", f(9.749), "Excellent"},
		{"exactly 9.50 is Excellent", f(9.5), "Excellent"},
		{"9.499 is only Very good", f(9.499), "Very good"},
		{"exactly 9.00 is Very good", f(9.0), "Very good"},
		{"8.999 is only Good", f(8.999), "Good"},
		{"exactly 8.00 is Good", f(8.0), "Good"},
		{"7.999 has no label", f(7.999), ""},
		{"0 has no label", f(0), ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := RatingLabel(tc.rating)
			if tc.want == "" {
				if got != nil {
					t.Fatalf("want nil, got %q", *got)
				}
				return
			}
			if got == nil || *got != tc.want {
				t.Fatalf("want %q, got %v", tc.want, got)
			}
		})
	}
}
