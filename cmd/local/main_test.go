package main

import "testing"

func TestListenAddr_loopbackOnly(t *testing.T) {
	cases := map[int]string{
		8080:  "127.0.0.1:8080",
		8092:  "127.0.0.1:8092",
		1:     "127.0.0.1:1",
		65535: "127.0.0.1:65535",
	}
	for port, want := range cases {
		got, err := listenAddr(port)
		if err != nil {
			t.Fatalf("port %d: unexpected error %v", port, err)
		}
		if got != want {
			t.Errorf("port %d: got %q, want %q", port, got, want)
		}
	}
}

func TestListenAddr_rejectsInvalidPorts(t *testing.T) {
	for _, port := range []int{0, -1, 65536} {
		if _, err := listenAddr(port); err == nil {
			t.Errorf("port %d: expected an error", port)
		}
	}
}
