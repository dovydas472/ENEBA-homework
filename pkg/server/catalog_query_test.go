package server

import (
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

func i64(v int64) *int64 { return &v }

const qLengthMsg = "q must be 2 to 100 characters long (spaces at the ends do not count)"

func TestParseListQuery_valid(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  catalog.Filter
	}{
		{"no parameters -> defaults", "",
			catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"one platform", "platform=psn",
			catalog.Filter{Platforms: []string{"psn"}, Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"several platforms and regions", "platform=steam,psn&region=europe,global",
			catalog.Filter{Platforms: []string{"steam", "psn"}, Regions: []string{"europe", "global"},
				Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"unknown slugs are fine (they match nothing)", "platform=nope",
			catalog.Filter{Platforms: []string{"nope"}, Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"empty value = parameter not given", "platform=&sort=&page=&minPrice=",
			catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"price range", "minPrice=500&maxPrice=2000",
			catalog.Filter{MinPrice: i64(500), MaxPrice: i64(2000), Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"min equals max", "minPrice=999&maxPrice=999",
			catalog.Filter{MinPrice: i64(999), MaxPrice: i64(999), Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"only maxPrice 0", "maxPrice=0",
			catalog.Filter{MaxPrice: i64(0), Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"sort price_asc", "sort=price_asc",
			catalog.Filter{Sort: catalog.SortPriceAsc, Page: 1, PageSize: 24}},
		{"sort price_desc", "sort=price_desc",
			catalog.Filter{Sort: catalog.SortPriceDesc, Page: 1, PageSize: 24}},
		{"sort discount", "sort=discount",
			catalog.Filter{Sort: catalog.SortDiscount, Page: 1, PageSize: 24}},
		{"sort newest", "sort=newest",
			catalog.Filter{Sort: catalog.SortNewest, Page: 1, PageSize: 24}},
		{"sort title", "sort=title",
			catalog.Filter{Sort: catalog.SortTitle, Page: 1, PageSize: 24}},
		// Search (Task 13a): q is trimmed, inner spaces collapsed; sort defaults to relevance.
		{"q -> default sort relevance", "q=witcher",
			catalog.Filter{Query: "witcher", Sort: catalog.SortRelevance, Page: 1, PageSize: 24}},
		{"q trimmed and inner spaces collapsed", "q=%20%20witchr%20%20%203%20",
			catalog.Filter{Query: "witchr 3", Sort: catalog.SortRelevance, Page: 1, PageSize: 24}},
		{"q with an explicit sort keeps that sort", "q=gta&sort=price_asc",
			catalog.Filter{Query: "gta", Sort: catalog.SortPriceAsc, Page: 1, PageSize: 24}},
		{"sort=relevance without q is allowed", "sort=relevance",
			catalog.Filter{Sort: catalog.SortRelevance, Page: 1, PageSize: 24}},
		{"empty q = not given -> popularity", "q=",
			catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"q with filters", "q=gta&platform=steam",
			catalog.Filter{Query: "gta", Platforms: []string{"steam"}, Sort: catalog.SortRelevance, Page: 1, PageSize: 24}},
		{"q of exactly 2 characters", "q=gt",
			catalog.Filter{Query: "gt", Sort: catalog.SortRelevance, Page: 1, PageSize: 24}},
		{"q of 100 characters (multi-byte, counted as characters)", "q=" + strings.Repeat("%C3%A9", 100),
			catalog.Filter{Query: strings.Repeat("é", 100), Sort: catalog.SortRelevance, Page: 1, PageSize: 24}},
		{"SQL-looking q is just text", "q=%27%3B%20DROP%20TABLE%20games%3B--",
			catalog.Filter{Query: "'; DROP TABLE games;--", Sort: catalog.SortRelevance, Page: 1, PageSize: 24}},
		{"paging", "page=3&pageSize=48",
			catalog.Filter{Sort: catalog.SortPopularity, Page: 3, PageSize: 48}},
		{"smallest page size", "pageSize=1",
			catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 1}},
		{"unknown parameter names are ignored", "foo=bar&search=witcher",
			catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 24}},
		{"everything at once", "platform=steam&region=global&minPrice=100&maxPrice=5000&sort=discount&page=2&pageSize=12",
			catalog.Filter{Platforms: []string{"steam"}, Regions: []string{"global"}, MinPrice: i64(100), MaxPrice: i64(5000),
				Sort: catalog.SortDiscount, Page: 2, PageSize: 12}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			q, err := url.ParseQuery(tc.query)
			if err != nil {
				t.Fatal(err)
			}
			got, err := parseListQuery(q)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got  %+v\nwant %+v", got, tc.want)
			}
		})
	}
}

func TestParseListQuery_invalid(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string // the exact message the client gets
	}{
		{"empty element in platform list", "platform=steam,,psn", "platform must be a comma-separated list of slugs (e.g. steam,psn)"},
		{"trailing comma in region", "region=europe,", "region must be a comma-separated list of slugs (e.g. steam,psn)"},
		{"platform given twice", "platform=steam&platform=psn", "platform must be given once; separate several values with commas"},
		{"too many platforms", "platform=" + strings.Repeat("a,", 20) + "a", "platform accepts at most 20 values"},
		{"minPrice not a number", "minPrice=abc", "minPrice must be an integer number of cents (0 or more)"},
		{"minPrice decimal", "minPrice=9.99", "minPrice must be an integer number of cents (0 or more)"},
		{"minPrice negative", "minPrice=-1", "minPrice must be an integer number of cents (0 or more)"},
		{"minPrice too large for int64", "minPrice=99999999999999999999", "minPrice must be an integer number of cents (0 or more)"},
		{"maxPrice not a number", "maxPrice=cheap", "maxPrice must be an integer number of cents (0 or more)"},
		{"maxPrice negative", "maxPrice=-5", "maxPrice must be an integer number of cents (0 or more)"},
		{"min greater than max", "minPrice=2000&maxPrice=1000", "minPrice must not be greater than maxPrice"},
		{"unknown sort", "sort=cheapest", "sort must be one of popularity, relevance, price_asc, price_desc, discount, newest, title"},
		{"sort is case sensitive", "sort=Title", "sort must be one of popularity, relevance, price_asc, price_desc, discount, newest, title"},
		{"page zero", "page=0", "page must be an integer between 1 and 10000"},
		{"page negative", "page=-2", "page must be an integer between 1 and 10000"},
		{"page text", "page=two", "page must be an integer between 1 and 10000"},
		{"page too large", "page=10001", "page must be an integer between 1 and 10000"},
		{"pageSize zero", "pageSize=0", "pageSize must be an integer between 1 and 48"},
		{"pageSize above max", "pageSize=49", "pageSize must be an integer between 1 and 48"},
		{"pageSize text", "pageSize=lots", "pageSize must be an integer between 1 and 48"},
		{"q of 1 character", "q=a", qLengthMsg},
		{"q of 1 character after trimming", "q=%20a%20%20", qLengthMsg},
		{"q of only spaces", "q=%20%20%20", qLengthMsg},
		{"q of 101 characters", "q=" + strings.Repeat("a", 101), qLengthMsg},
		{"q given twice", "q=gta&q=rdr2", "q must be given once"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			q, err := url.ParseQuery(tc.query)
			if err != nil {
				t.Fatal(err)
			}
			_, err = parseListQuery(q)
			if err == nil {
				t.Fatalf("want error %q, got none", tc.want)
			}
			if err.Error() != tc.want {
				t.Fatalf("got message %q\nwant        %q", err.Error(), tc.want)
			}
		})
	}
}
