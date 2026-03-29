// Package service provides application-level business logic.
package service

import (
	"fmt"
	"log"
	"net/smtp"

	"github.com/CatHeadTab/backend/internal/config"
)

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
		log.Printf("⚠️  SMTP not configured, skipping verification email for %s (token: %s)", toEmail, token)
		return nil
	}

	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", s.cfg.FrontendURL, token)

	subject := "Verify your CatHeadTab email"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; max-width: 520px; margin: 0 auto; padding: 20px;">
  <p>Hello,</p>
  <p>Thank you for registering with CatHeadTab!</p>
  <p>Please verify your email address by clicking the link below:</p>
  <p><a href="%s" style="color: #1a73e8; text-decoration: underline; word-break: break-all;">%s</a></p>
  <p>This link will expire in 24 hours.</p>
  <p style="color: #999; font-size: 13px;">If you did not create this account, please ignore this email.</p>
  <p style="color: #999;">— CatHeadTab Team</p>
</div>
</body>
</html>`, verifyURL, verifyURL)

	return s.sendHTML(toEmail, subject, body)
}

// SendPasswordResetEmail sends a password reset link.
func (s *EmailService) SendPasswordResetEmail(toEmail, token string) error {
	if !s.IsConfigured() {
		log.Printf("⚠️  SMTP not configured, skipping password reset email for %s (token: %s)", toEmail, token)
		return nil
	}

	resetURL := fmt.Sprintf("%s/reset-password?token=%s", s.cfg.FrontendURL, token)

	subject := "Reset your CatHeadTab password"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; max-width: 520px; margin: 0 auto; padding: 20px;">
  <p>Hello,</p>
  <p>We received a request to reset your CatHeadTab password.</p>
  <p>Click the link below to set a new password:</p>
  <p><a href="%s" style="color: #1a73e8; text-decoration: underline; word-break: break-all;">%s</a></p>
  <p>This link will expire in 1 hour.</p>
  <p style="color: #999; font-size: 13px;">If you did not request this, please ignore this email and your password will remain unchanged.</p>
  <p style="color: #999;">— CatHeadTab Team</p>
</div>
</body>
</html>`, resetURL, resetURL)

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

	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(msg)); err != nil {
		return fmt.Errorf("failed to send email to %s: %w", to, err)
	}

	log.Printf("📧 Email sent to %s: %s", to, subject)
	return nil
}
