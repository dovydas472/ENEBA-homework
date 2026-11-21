// Package catalog reads the product catalog (listing, product page, facets)
// from Postgres with hand-written pgx queries. It knows nothing about HTTP.
package catalog

// ratingTiers are the seller tier labels from docs/DATA_MODEL.md. Checked
// top-down: the first row whose threshold the rating reaches wins.
var ratingTiers = []struct {
	min   float64
	label string
}{
	{9.75, "Superb"},
	{9.50, "Excellent"},
	{9.00, "Very good"},
	{8.00, "Good"},
}

// RatingLabel turns a seller rating into its tier label.
// nil is returned for a new seller (rating NULL) and for ratings below 8.00:
// in both cases there is no label to show.
//
// The label is computed here (not stored in the database), so the wording and
// the thresholds live in exactly one place and can never disagree with the number.
func RatingLabel(rating *float64) *string {
	if rating == nil {
		return nil
	}
	for _, tier := range ratingTiers {
		if *rating >= tier.min {
			label := tier.label
			return &label
		}
	}
	return nil
}
