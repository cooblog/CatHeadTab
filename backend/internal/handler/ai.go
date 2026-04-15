package handler

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AIHandler handles server-side AI chat endpoints.
type AIHandler struct {
	cfg       *config.Config
	usageRepo repository.AIUsageRepository
}

// NewAIHandler creates a new AIHandler.
func NewAIHandler(cfg *config.Config, usageRepo repository.AIUsageRepository) *AIHandler {
	return &AIHandler{cfg: cfg, usageRepo: usageRepo}
}

// ChatRequest represents the request body for the AI chat endpoint.
type ChatRequest struct {
	Messages []ChatMessage `json:"messages" binding:"required"`
	Tools    []any         `json:"tools,omitempty"`
	Stream   *bool         `json:"stream,omitempty"`
}

// ChatMessage represents a single message in the conversation.
type ChatMessage struct {
	Role       string `json:"role"`
	Content    any    `json:"content"`
	Name       string `json:"name,omitempty"`
	ToolCalls  any    `json:"tool_calls,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
}

// sseUsage 从 SSE data 行中解析 usage 信息
type sseUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// sseChunk 表示 SSE 流中的一个 chunk
type sseChunk struct {
	Usage *sseUsage `json:"usage,omitempty"`
}

// GetConfig returns the server-side AI configuration for the frontend.
// GET /api/v1/ai/config
func (h *AIHandler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"configured": h.cfg.IsAIConfigured(),
		"provider":   h.cfg.AIProvider,
		"model":      h.cfg.AIModel,
	})
}

// Chat proxies the chat request to the configured OpenAI-compatible API with SSE streaming.
// POST /api/v1/ai/chat
func (h *AIHandler) Chat(c *gin.Context) {
	if !h.cfg.IsAIConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Server-side AI is not configured"})
		return
	}

	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages is required"})
		return
	}

	// 构建发送给 LLM 的请求体，启用 stream_options 以获取 usage 数据
	llmBody := map[string]any{
		"model":    h.cfg.AIModel,
		"messages": req.Messages,
		"stream":   true,
		"stream_options": map[string]any{
			"include_usage": true,
		},
	}
	if len(req.Tools) > 0 {
		llmBody["tools"] = req.Tools
	}

	bodyBytes, err := json.Marshal(llmBody)
	if err != nil {
		logger.Error("failed to marshal LLM request", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build request"})
		return
	}

	// 构建 HTTP 请求
	baseURL := strings.TrimRight(h.cfg.AIBaseURL, "/")
	llmURL := baseURL + "/chat/completions"

	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", llmURL, strings.NewReader(string(bodyBytes)))
	if err != nil {
		logger.Error("failed to create LLM request", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.cfg.AIAPIKey)

	// 发送请求
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		logger.Error("LLM request failed", "error", err, "url", llmURL)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to connect to AI provider"})
		return
	}
	defer resp.Body.Close()

	// 如果 LLM 返回非 2xx，直接转发错误
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		logger.Error("LLM returned error",
			"status", resp.StatusCode,
			"body", string(body),
			"url", llmURL,
		)
		c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
		return
	}

	userIDStr := c.GetString("user_id")
	logger.Info("AI chat request",
		"user_id", userIDStr,
		"model", h.cfg.AIModel,
		"messages_count", len(req.Messages),
	)

	// SSE 流式转发，同时解析 usage 数据
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		logger.Error("streaming not supported")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming not supported"})
		return
	}

	var finalUsage sseUsage
	scanner := bufio.NewScanner(resp.Body)
	// SSE 行可能很长（含 tool call 的 JSON），增大 buffer
	scanner.Buffer(make([]byte, 0, 64*1024), 512*1024)

	for scanner.Scan() {
		line := scanner.Text()

		// 转发原始 SSE 行到客户端
		if _, writeErr := fmt.Fprintf(c.Writer, "%s\n", line); writeErr != nil {
			logger.Debug("client disconnected during AI stream", "user_id", userIDStr)
			break
		}
		flusher.Flush()

		// 解析 data: 行中的 usage 信息
		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				continue
			}
			var chunk sseChunk
			if json.Unmarshal([]byte(data), &chunk) == nil && chunk.Usage != nil {
				finalUsage = *chunk.Usage
			}
		}
	}

	if err := scanner.Err(); err != nil {
		logger.Error("error reading LLM stream", "error", err)
	}

	// 记录 token 用量到数据库
	if finalUsage.TotalTokens > 0 {
		userID, parseErr := uuid.Parse(userIDStr)
		if parseErr == nil {
			if dbErr := h.usageRepo.IncrementUsage(userID, finalUsage.PromptTokens, finalUsage.CompletionTokens, finalUsage.TotalTokens); dbErr != nil {
				logger.Error("failed to record AI usage", "user_id", userIDStr, "error", dbErr)
			} else {
				logger.Info("AI usage recorded",
					"user_id", userIDStr,
					"prompt_tokens", finalUsage.PromptTokens,
					"completion_tokens", finalUsage.CompletionTokens,
					"total_tokens", finalUsage.TotalTokens,
				)
			}
		}
	}
}

// GetUsage returns the current user's AI usage for today.
// GET /api/v1/ai/usage
func (h *AIHandler) GetUsage(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	usage, err := h.usageRepo.GetTodayUsage(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get usage"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"date":              usage.UsageDate.Format("2006-01-02"),
		"request_count":     usage.RequestCount,
		"prompt_tokens":     usage.PromptTokens,
		"completion_tokens": usage.CompletionTokens,
		"total_tokens":      usage.TotalTokens,
		"daily_limit":       h.cfg.AIDailyTokenLimit,
	})
}

// Models lists available models from the configured AI provider.
// GET /api/v1/ai/models
func (h *AIHandler) Models(c *gin.Context) {
	if !h.cfg.IsAIConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Server-side AI is not configured"})
		return
	}

	baseURL := strings.TrimRight(h.cfg.AIBaseURL, "/")
	modelsURL := baseURL + "/models"

	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "GET", modelsURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}
	httpReq.Header.Set("Authorization", "Bearer "+h.cfg.AIAPIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("Failed to fetch models: %v", err)})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
}
