package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/google/uuid"
)

// VerificationRepository handles email verification and password reset tokens.
type VerificationRepository interface {
	CreateEmailVerification(userID uuid.UUID) (*model.EmailVerification, error)
	GetEmailVerification(token string) (*model.EmailVerification, error)
	DeleteEmailVerifications(userID uuid.UUID) error

	CreatePasswordReset(userID uuid.UUID) (*model.PasswordReset, error)
	GetPasswordReset(token string) (*model.PasswordReset, error)
	MarkPasswordResetUsed(token string) error
	DeletePasswordResets(userID uuid.UUID) error
}

type postgresVerificationRepository struct {
	db *sql.DB
}

// NewVerificationRepository creates a new VerificationRepository.
func NewVerificationRepository(db *sql.DB) VerificationRepository {
	return &postgresVerificationRepository{db: db}
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (r *postgresVerificationRepository) CreateEmailVerification(userID uuid.UUID) (*model.EmailVerification, error) {
	// Delete existing tokens for this user first
	if err := r.DeleteEmailVerifications(userID); err != nil {
		return nil, err
	}

	token, err := generateToken()
	if err != nil {
		return nil, err
	}

	v := &model.EmailVerification{
		ID:        uuid.New(),
		UserID:    userID,
		Token:     token,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	err = r.db.QueryRow(
		`INSERT INTO email_verifications (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4) RETURNING created_at`,
		v.ID, v.UserID, v.Token, v.ExpiresAt,
	).Scan(&v.CreatedAt)

	return v, err
}

func (r *postgresVerificationRepository) GetEmailVerification(token string) (*model.EmailVerification, error) {
	var v model.EmailVerification
	err := r.db.QueryRow(
		`SELECT id, user_id, token, expires_at, created_at FROM email_verifications WHERE token = $1 AND expires_at > NOW()`,
		token,
	).Scan(&v.ID, &v.UserID, &v.Token, &v.ExpiresAt, &v.CreatedAt)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &v, nil
}

func (r *postgresVerificationRepository) DeleteEmailVerifications(userID uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM email_verifications WHERE user_id = $1`, userID)
	return err
}

func (r *postgresVerificationRepository) CreatePasswordReset(userID uuid.UUID) (*model.PasswordReset, error) {
	// Invalidate previous tokens
	if err := r.DeletePasswordResets(userID); err != nil {
		return nil, err
	}

	token, err := generateToken()
	if err != nil {
		return nil, err
	}

	pr := &model.PasswordReset{
		ID:        uuid.New(),
		UserID:    userID,
		Token:     token,
		ExpiresAt: time.Now().Add(1 * time.Hour),
	}

	err = r.db.QueryRow(
		`INSERT INTO password_resets (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4) RETURNING created_at`,
		pr.ID, pr.UserID, pr.Token, pr.ExpiresAt,
	).Scan(&pr.CreatedAt)

	return pr, err
}

func (r *postgresVerificationRepository) GetPasswordReset(token string) (*model.PasswordReset, error) {
	var pr model.PasswordReset
	err := r.db.QueryRow(
		`SELECT id, user_id, token, expires_at, used, created_at FROM password_resets WHERE token = $1 AND expires_at > NOW() AND used = FALSE`,
		token,
	).Scan(&pr.ID, &pr.UserID, &pr.Token, &pr.ExpiresAt, &pr.Used, &pr.CreatedAt)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &pr, nil
}

func (r *postgresVerificationRepository) MarkPasswordResetUsed(token string) error {
	_, err := r.db.Exec(`UPDATE password_resets SET used = TRUE WHERE token = $1`, token)
	return err
}

func (r *postgresVerificationRepository) DeletePasswordResets(userID uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM password_resets WHERE user_id = $1`, userID)
	return err
}
