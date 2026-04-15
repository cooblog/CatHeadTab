// Package service provides application-level business logic.
package service

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"time"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/logger"
)

// formatDuration 将 time.Duration 格式化为人类可读的字符串（如 "24 hours"、"5 minutes"）
func formatDuration(d time.Duration) string {
	if d >= 24*time.Hour && d%(24*time.Hour) == 0 {
		days := int(d / (24 * time.Hour))
		if days == 1 {
			return "1 day"
		}
		return fmt.Sprintf("%d days", days)
	}
	if d >= time.Hour && d%time.Hour == 0 {
		hours := int(d / time.Hour)
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}
	minutes := int(d / time.Minute)
	if minutes <= 1 {
		return "1 minute"
	}
	return fmt.Sprintf("%d minutes", minutes)
}

// EmailService handles sending transactional emails.
type EmailService struct {
	cfg *config.Config
}

// NewEmailService creates a new EmailService.
func NewEmailService(cfg *config.Config) *EmailService {
	return &EmailService{cfg: cfg}
}

// IsConfigured returns true if SMTP settings are configured.
func (s *EmailService) IsConfigured() bool {
	return s.cfg.SMTPHost != "" && s.cfg.SMTPUser != ""
}

// SendVerificationEmail sends an email verification link.
func (s *EmailService) SendVerificationEmail(toEmail, token string) error {
	if !s.IsConfigured() {
		logger.Warn("SMTP not configured, skipping verification email", "to", toEmail, "token", token)
		return nil
	}

	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", s.cfg.FrontendURL, token)

	subject := "Verify your CatHeadTab email"
	expiry := formatDuration(s.cfg.EmailVerifyTokenTTL)
	body := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; max-width: 520px; margin: 0 auto; padding: 20px;">
  <p>Hello,</p>
  <p>Thank you for registering with CatHeadTab!</p>
  <p>Please verify your email address by clicking the link below:</p>
  <p><a href="%s" style="color: #1a73e8; text-decoration: underline; word-break: break-all;">%s</a></p>
  <p>This link will expire in %s.</p>
  <p style="color: #999; font-size: 13px;">If you did not create this account, please ignore this email.</p>
  <p style="color: #999;">— CatHeadTab Team</p>
</div>
</body>
</html>`, verifyURL, verifyURL, expiry)

	return s.sendHTML(toEmail, subject, body)
}

// SendPasswordResetEmail sends a password reset link.
func (s *EmailService) SendPasswordResetEmail(toEmail, token string) error {
	if !s.IsConfigured() {
		logger.Warn("SMTP not configured, skipping password reset email", "to", toEmail, "token", token)
		return nil
	}

	resetURL := fmt.Sprintf("%s/reset-password?token=%s", s.cfg.FrontendURL, token)

	subject := "Reset your CatHeadTab password"
	expiry := formatDuration(s.cfg.PasswordResetTokenTTL)
	body := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; max-width: 520px; margin: 0 auto; padding: 20px;">
  <p>Hello,</p>
  <p>We received a request to reset your CatHeadTab password.</p>
  <p>Click the link below to set a new password:</p>
  <p><a href="%s" style="color: #1a73e8; text-decoration: underline; word-break: break-all;">%s</a></p>
  <p>This link will expire in %s.</p>
  <p style="color: #999; font-size: 13px;">If you did not request this, please ignore this email and your password will remain unchanged.</p>
  <p style="color: #999;">— CatHeadTab Team</p>
</div>
</body>
</html>`, resetURL, resetURL, expiry)

	return s.sendHTML(toEmail, subject, body)
}

func (s *EmailService) send(to, subject, body string) error {
	return s.sendMail(to, subject, body, "text/plain")
}

func (s *EmailService) sendHTML(to, subject, body string) error {
	return s.sendMail(to, subject, body, "text/html")
}

func (s *EmailService) sendMail(to, subject, body, contentType string) error {
	from := s.cfg.SMTPFrom
	addr := fmt.Sprintf("%s:%s", s.cfg.SMTPHost, s.cfg.SMTPPort)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: %s; charset=\"UTF-8\"\r\n\r\n%s",
		from, to, subject, contentType, body)

	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPassword, s.cfg.SMTPHost)

	if s.cfg.SMTPSSL {
		// 隐式 SSL（端口 465）：直接建立 TLS 连接
		if err := s.sendMailSSL(addr, auth, from, to, []byte(msg)); err != nil {
			return fmt.Errorf("failed to send email to %s via SSL: %w", to, err)
		}
	} else {
		// STARTTLS（端口 587）：明文连接后升级为 TLS
		if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(msg)); err != nil {
			return fmt.Errorf("failed to send email to %s: %w", to, err)
		}
	}

	logger.Info("Email sent", "to", to, "subject", subject, "ssl", s.cfg.SMTPSSL)
	return nil
}

// sendMailSSL 通过隐式 TLS 连接发送邮件（用于端口 465）
func (s *EmailService) sendMailSSL(addr string, auth smtp.Auth, from, to string, msg []byte) error {
	tlsConfig := &tls.Config{
		ServerName: s.cfg.SMTPHost,
	}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("TLS dial failed: %w", err)
	}
	defer conn.Close()

	host, _, _ := net.SplitHostPort(addr)
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("SMTP client creation failed: %w", err)
	}
	defer client.Close()

	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP auth failed: %w", err)
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("SMTP MAIL FROM failed: %w", err)
	}

	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("SMTP RCPT TO failed: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA failed: %w", err)
	}

	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("SMTP write failed: %w", err)
	}

	if err := w.Close(); err != nil {
		return fmt.Errorf("SMTP data close failed: %w", err)
	}

	return client.Quit()
}
