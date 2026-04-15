// Package logger 提供基于 zap + lumberjack 的结构化日志系统，
// 支持日志级别控制、控制台/文件双输出、按大小和时间滚动存储。
package logger

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

// L 是全局 Logger 实例。
var L *zap.SugaredLogger

// Config 定义日志配置参数。
type Config struct {
	// Level 日志级别：debug, info, warn, error
	Level string
	// FilePath 日志文件路径，为空则仅输出到控制台
	FilePath string
	// MaxSize 单个日志文件的最大大小（MB），超过后自动滚动
	MaxSize int
	// MaxAge 日志文件保留的最大天数
	MaxAge int
	// MaxBackups 保留的旧日志文件最大数量
	MaxBackups int
	// Compress 是否压缩归档的日志文件
	Compress bool
}

// Init 初始化全局 Logger。应在程序启动时调用。
func Init(cfg Config) {
	level := parseLevel(cfg.Level)

	// 控制台编码器：人类可读格式
	consoleEncoder := zapcore.NewConsoleEncoder(zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "",
		MessageKey:     "msg",
		StacktraceKey:  "",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.CapitalColorLevelEncoder,
		EncodeTime:     zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05"),
		EncodeDuration: zapcore.StringDurationEncoder,
	})

	// 文件编码器：JSON 格式，便于日志采集和分析
	fileEncoder := zapcore.NewJSONEncoder(zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.LowercaseLevelEncoder,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.StringDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	})

	// 控制台输出（始终启用）
	consoleSyncer := zapcore.AddSync(os.Stdout)
	cores := []zapcore.Core{
		zapcore.NewCore(consoleEncoder, consoleSyncer, level),
	}

	// 文件输出（可选，通过 lumberjack 实现滚动存储）
	if cfg.FilePath != "" {
		maxSize := cfg.MaxSize
		if maxSize <= 0 {
			maxSize = 100 // 默认 100MB
		}
		maxAge := cfg.MaxAge
		if maxAge <= 0 {
			maxAge = 30 // 默认保留 30 天
		}
		maxBackups := cfg.MaxBackups
		if maxBackups <= 0 {
			maxBackups = 10 // 默认保留 10 个旧文件
		}

		lj := &lumberjack.Logger{
			Filename:   cfg.FilePath,
			MaxSize:    maxSize,
			MaxAge:     maxAge,
			MaxBackups: maxBackups,
			Compress:   cfg.Compress,
			LocalTime:  true,
		}
		fileSyncer := zapcore.AddSync(lj)
		cores = append(cores, zapcore.NewCore(fileEncoder, fileSyncer, level))
	}

	core := zapcore.NewTee(cores...)
	zapLogger := zap.New(core, zap.AddCaller(), zap.AddCallerSkip(1))
	L = zapLogger.Sugar()
}

// Sync 刷新缓冲区中的日志，应在程序退出时调用。
func Sync() {
	if L != nil {
		_ = L.Sync()
	}
}

// 便捷方法 — 对外暴露的包级函数，方便全局调用。

// Debug 输出 debug 级别日志。
func Debug(msg string, keysAndValues ...interface{}) {
	L.Debugw(msg, keysAndValues...)
}

// Info 输出 info 级别日志。
func Info(msg string, keysAndValues ...interface{}) {
	L.Infow(msg, keysAndValues...)
}

// Warn 输出 warn 级别日志。
func Warn(msg string, keysAndValues ...interface{}) {
	L.Warnw(msg, keysAndValues...)
}

// Error 输出 error 级别日志。
func Error(msg string, keysAndValues ...interface{}) {
	L.Errorw(msg, keysAndValues...)
}

// Fatal 输出 fatal 级别日志并退出程序。
func Fatal(msg string, keysAndValues ...interface{}) {
	L.Fatalw(msg, keysAndValues...)
}

// Infof 以 printf 风格输出 info 级别日志。
func Infof(format string, args ...interface{}) {
	L.Infof(format, args...)
}

// Warnf 以 printf 风格输出 warn 级别日志。
func Warnf(format string, args ...interface{}) {
	L.Warnf(format, args...)
}

// Errorf 以 printf 风格输出 error 级别日志。
func Errorf(format string, args ...interface{}) {
	L.Errorf(format, args...)
}

// Debugf 以 printf 风格输出 debug 级别日志。
func Debugf(format string, args ...interface{}) {
	L.Debugf(format, args...)
}

// Fatalf 以 printf 风格输出 fatal 级别日志并退出程序。
func Fatalf(format string, args ...interface{}) {
	L.Fatalf(format, args...)
}

// parseLevel 将字符串日志级别转换为 zapcore.Level。
func parseLevel(level string) zapcore.Level {
	switch level {
	case "debug":
		return zapcore.DebugLevel
	case "info":
		return zapcore.InfoLevel
	case "warn":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}
