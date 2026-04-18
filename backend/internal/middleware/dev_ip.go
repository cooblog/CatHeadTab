package middleware

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/gin-gonic/gin"
)

// DevIPMiddleware detects if the request is from a loopback address in debug mode.
// If so, it attempts to fetch the public IP of the server and injects it into the context
// to simulate a real client request for geolocation features.
func DevIPMiddleware() gin.HandlerFunc {
	var publicIP string
	var lastFetched time.Time

	return func(c *gin.Context) {
		if gin.Mode() != gin.DebugMode {
			c.Next()
			return
		}

		ip := c.ClientIP()
		if ip == "127.0.0.1" || ip == "::1" {
			// Cache the public IP for 10 minutes to avoid hitting the API too much
			if publicIP == "" || time.Since(lastFetched) > 10*time.Minute {
				client := &http.Client{Timeout: 2 * time.Second}
				resp, err := client.Get("https://api.ipify.org")
				if err == nil {
					defer resp.Body.Close()
					body, _ := io.ReadAll(resp.Body)
					fetched := strings.TrimSpace(string(body))
					if fetched != "" {
						publicIP = fetched
						lastFetched = time.Now()
						logger.Info("[middleware] dev-ip detected", "ip", publicIP)
					}
				}
			}

			// We can't easily override c.ClientIP() because it's a method calling Request.RemoteAddr
			// But we can set a custom key that our handlers can check, or better, modify the Request.RemoteAddr
			// for subsequent calls to c.ClientIP() if we really want to fool it.
			// However, since we trust proxies, we can just set X-Forwarded-For if it's missing.
			if publicIP != "" {
				c.Request.Header.Set("X-Forwarded-For", publicIP)
			}
		}
		c.Next()
	}
}
