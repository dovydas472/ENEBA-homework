package server

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

const (
	maxPage        = 10000 // keeps (page-1)*pageSize far away from integer overflow
	maxSlugsInList = 20    // platform/region lists are short; a longer one is a mistake or abuse
)

// parseListQuery turns the query string of GET /api/products into a validated
// catalog.Filter. It is a pure function (no HTTP, no database), so every rule
// is covered by a table test.
//
// Rules:
//   - an INVALID value is an error: the message is sent to the client with
//     status 400, so a typo is never silently ignored (a client that sends
//     sort=cheapest must learn that it got the default order);
//   - an EMPTY value (?platform=) means "parameter not given";
//   - unknown parameter NAMES are ignored (the search task adds `q` later);
//   - unknown slugs are valid: they simply match nothing.
//
// Every error message is written for the client and contains no internals.
func parseListQuery(q url.Values) (catalog.Filter, error) {
	f := catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: catalog.DefaultPageSize}
	var err error

	if f.Platforms, err = parseSlugList(q, "platform"); err != nil {
		return f, err
	}
	if f.Regions, err = parseSlugList(q, "region"); err != nil {
		return f, err
	}

	if f.MinPrice, err = parseCents(q, "minPrice"); err != nil {
		return f, err
	}
	if f.MaxPrice, err = parseCents(q, "maxPrice"); err != nil {
		return f, err
	}
	if f.MinPrice != nil && f.MaxPrice != nil && *f.MinPrice > *f.MaxPrice {
		return f, errors.New("minPrice must not be greater than maxPrice")
	}

	if v, given, err := single(q, "sort"); err != nil {
		return f, err
	} else if given {
		f.Sort = catalog.Sort(v)
		if !validSort(f.Sort) {
			names := make([]string, len(catalog.Sorts))
			for i, s := range catalog.Sorts {
				names[i] = string(s)
			}
			return f, errors.New("sort must be one of " + strings.Join(names, ", "))
		}
	}

	if f.Page, err = parseIntInRange(q, "page", 1, maxPage, f.Page); err != nil {
		return f, err
	}
	if f.PageSize, err = parseIntInRange(q, "pageSize", 1, catalog.MaxPageSize, f.PageSize); err != nil {
		return f, err
	}
	return f, nil
}

// single returns the value of a parameter that must appear at most once.
// given is false when the parameter is missing or empty.
func single(q url.Values, name string) (value string, given bool, err error) {
	vals := q[name]
	switch {
	case len(vals) == 0:
		return "", false, nil
	case len(vals) > 1:
		return "", false, fmt.Errorf("%s must be given once; separate several values with commas", name)
	case vals[0] == "":
		return "", false, nil
	}
	return vals[0], true, nil
}

func validSort(s catalog.Sort) bool {
	for _, ok := range catalog.Sorts {
		if s == ok {
			return true
		}
	}
	return false
}

// parseSlugList reads "steam,psn" into ["steam","psn"]. nil = no filter.
func parseSlugList(q url.Values, name string) ([]string, error) {
	v, given, err := single(q, name)
	if err != nil || !given {
		return nil, err
	}
	parts := strings.Split(v, ",")
	for _, p := range parts {
		if p == "" { // "a,,b" or a trailing comma
			return nil, fmt.Errorf("%s must be a comma-separated list of slugs (e.g. steam,psn)", name)
		}
	}
	if len(parts) > maxSlugsInList {
		return nil, fmt.Errorf("%s accepts at most %d values", name, maxSlugsInList)
	}
	return parts, nil
}

// parseCents reads an optional integer number of cents >= 0.
func parseCents(q url.Values, name string) (*int64, error) {
	v, given, err := single(q, name)
	if err != nil || !given {
		return nil, err
	}
	n, perr := strconv.ParseInt(v, 10, 64)
	if perr != nil || n < 0 {
		return nil, fmt.Errorf("%s must be an integer number of cents (0 or more)", name)
	}
	return &n, nil
}

// parseIntInRange reads an optional integer in [min, max]; def is used when it is not given.
func parseIntInRange(q url.Values, name string, min, max, def int) (int, error) {
	v, given, err := single(q, name)
	if err != nil {
		return 0, err
	}
	if !given {
		return def, nil
	}
	n, perr := strconv.Atoi(v)
	if perr != nil || n < min || n > max {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", name, min, max)
	}
	return n, nil
}
