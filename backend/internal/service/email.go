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

	verifyURL := fmt.Sprintf("%s/#/verify-email?token=%s", s.cfg.FrontendURL, token)

	subject := "Verify your CatHeadTab email"
	body := fmt.Sprintf(`Hello,

Thank you for registering with CatHeadTab!

Please verify your email address by clicking the link below:

%s

This link will expire in 24 hours.

If you did not create this account, please ignore this email.

— CatHeadTab Team`, verifyURL)

	return s.send(toEmail, subject, body)
}

// SendPasswordResetEmail sends a password reset link.
func (s *EmailService) SendPasswordResetEmail(toEmail, token string) error {
	if !s.IsConfigured() {
		log.Printf("⚠️  SMTP not configured, skipping password reset email for %s (token: %s)", toEmail, token)
		return nil
	}

	resetURL := fmt.Sprintf("%s/#/reset-password?token=%s", s.cfg.FrontendURL, token)

	subject := "Reset your CatHeadTab password"
	body := fmt.Sprintf(`Hello,

We received a request to reset your CatHeadTab password.

Click the link below to set a new password:

%s

This link will expire in 1 hour.

If you did not request this, please ignore this email and your password will remain unchanged.

— CatHeadTab Team`, resetURL)

	return s.send(toEmail, subject, body)
}

func (s *EmailService) send(to, subject, body string) error {
	from := s.cfg.SMTPFrom
	addr := fmt.Sprintf("%s:%s", s.cfg.SMTPHost, s.cfg.SMTPPort)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		from, to, subject, body)

	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPassword, s.cfg.SMTPHost)

	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(msg)); err != nil {
		return fmt.Errorf("failed to send email to %s: %w", to, err)
	}

	log.Printf("📧 Email sent to %s: %s", to, subject)
	return nil
}
