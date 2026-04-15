// Package logger 提供 Gin 框架的 zap 日志中间件，
// 替代 gin.Default() 自带的 Logger 和 Recovery 中间件。
package logger

import (
	"net"
	"net/http"
	"net/http/httputil"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// GinLogger 返回使用 zap 记录 HTTP 请求日志的 Gin 中间件。
func GinLogger() gin.HandlerFunc {
	zapLogger := L.Desugar()
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		fields := []zap.Field{
			zap.Int("status", status),
			zap.String("method", c.Request.Method),
			zap.String("path", path),
			zap.String("query", query),
			zap.String("ip", c.ClientIP()),
			zap.String("user-agent", c.Request.UserAgent()),
			zap.Duration("latency", latency),
			zap.Int("body_size", c.Writer.Size()),
		}

		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("errors", c.Errors.ByType(gin.ErrorTypePrivate).String()))
		}

		if status >= http.StatusInternalServerError {
			zapLogger.Error("HTTP request", fields...)
		} else if status >= http.StatusBadRequest {
			zapLogger.Warn("HTTP request", fields...)
		} else {
			zapLogger.Info("HTTP request", fields...)
		}
	}
}

// GinRecovery 返回使用 zap 记录 panic 恢复日志的 Gin 中间件。
func GinRecovery() gin.HandlerFunc {
	zapLogger := L.Desugar()
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// 检查是否为客户端断开连接导致的 broken pipe 错误
				var brokenPipe bool
				if ne, ok := err.(*net.OpError); ok {
					if se, ok := ne.Err.(*os.SyscallError); ok {
						if strings.Contains(strings.ToLower(se.Error()), "broken pipe") ||
							strings.Contains(strings.ToLower(se.Error()), "connection reset by peer") {
							brokenPipe = true
						}
					}
				}

				httpRequest, _ := httputil.DumpRequest(c.Request, false)
				if brokenPipe {
					zapLogger.Error("broken pipe",
						zap.Any("error", err),
						zap.String("request", string(httpRequest)),
					)
					_ = c.Error(err.(error))
					c.Abort()
					return
				}

				zapLogger.Error("[Recovery] panic recovered",
					zap.Any("error", err),
					zap.String("request", string(httpRequest)),
					zap.String("stack", string(debug.Stack())),
				)
				c.AbortWithStatus(http.StatusInternalServerError)
			}
		}()
		c.Next()
	}
}
