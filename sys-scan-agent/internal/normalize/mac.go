package normalize

import "strings"

// NormalizarMAC aplica la regla de #59 R15: quitar todo lo que no sea hex y
// pasar a minúsculas. Devuelve "" si no queda una MAC válida (12 hex).
func NormalizarMAC(mac string) string {
	var b strings.Builder
	b.Grow(12)
	for _, r := range strings.ToLower(mac) {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') {
			b.WriteRune(r)
		}
	}
	s := b.String()
	if len(s) != 12 {
		return ""
	}
	return s
}
