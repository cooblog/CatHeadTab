package repository

import (
	"database/sql"
	"errors"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/google/uuid"
)

// OAuthRepository handles database operations for OAuth linked accounts.
type OAuthRepository interface {
	Create(account *model.OAuthAccount) error
	GetByProviderAndID(provider, providerUserID string) (*model.OAuthAccount, error)
	ListByUserID(userID uuid.UUID) ([]*model.OAuthAccount, error)
	Delete(userID uuid.UUID, provider string) error
	UpdateTokens(id uuid.UUID, accessToken, refreshToken string) error
}

type postgresOAuthRepository struct {
	db *sql.DB
}

// NewOAuthRepository creates a new OAuthRepository.
func NewOAuthRepository(db *sql.DB) OAuthRepository {
	return &postgresOAuthRepository{db: db}
}

func (r *postgresOAuthRepository) Create(account *model.OAuthAccount) error {
	if account.ID == uuid.Nil {
		account.ID = uuid.New()
	}

	err := r.db.QueryRow(
		`INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, provider_email, provider_username, avatar_url, access_token, refresh_token)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING linked_at`,
		account.ID, account.UserID, account.Provider, account.ProviderUserID,
		account.ProviderEmail, account.ProviderUsername, account.AvatarURL,
		account.AccessToken, account.RefreshToken,
	).Scan(&account.LinkedAt)

	return err
}

func (r *postgresOAuthRepository) GetByProviderAndID(provider, providerUserID string) (*model.OAuthAccount, error) {
	var a model.OAuthAccount
	var providerEmail, providerUsername, avatarURL sql.NullString

	err := r.db.QueryRow(
		`SELECT id, user_id, provider, provider_user_id, provider_email, provider_username, avatar_url, linked_at
		FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2`,
		provider, providerUserID,
	).Scan(&a.ID, &a.UserID, &a.Provider, &a.ProviderUserID, &providerEmail, &providerUsername, &avatarURL, &a.LinkedAt)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if providerEmail.Valid {
		a.ProviderEmail = providerEmail.String
	}
	if providerUsername.Valid {
		a.ProviderUsername = providerUsername.String
	}
	if avatarURL.Valid {
		a.AvatarURL = avatarURL.String
	}

	return &a, nil
}

func (r *postgresOAuthRepository) ListByUserID(userID uuid.UUID) ([]*model.OAuthAccount, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, provider, provider_user_id, provider_email, provider_username, avatar_url, linked_at
		FROM oauth_accounts WHERE user_id = $1 ORDER BY linked_at`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []*model.OAuthAccount
	for rows.Next() {
		var a model.OAuthAccount
		var providerEmail, providerUsername, avatarURL sql.NullString

		if err := rows.Scan(&a.ID, &a.UserID, &a.Provider, &a.ProviderUserID, &providerEmail, &providerUsername, &avatarURL, &a.LinkedAt); err != nil {
			return nil, err
		}

		if providerEmail.Valid {
			a.ProviderEmail = providerEmail.String
		}
		if providerUsername.Valid {
			a.ProviderUsername = providerUsername.String
		}
		if avatarURL.Valid {
			a.AvatarURL = avatarURL.String
		}

		accounts = append(accounts, &a)
	}

	return accounts, nil
}

func (r *postgresOAuthRepository) Delete(userID uuid.UUID, provider string) error {
	_, err := r.db.Exec(`DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2`, userID, provider)
	return err
}

func (r *postgresOAuthRepository) UpdateTokens(id uuid.UUID, accessToken, refreshToken string) error {
	_, err := r.db.Exec(
		`UPDATE oauth_accounts SET access_token = $1, refresh_token = $2 WHERE id = $3`,
		accessToken, refreshToken, id,
	)
	return err
}
