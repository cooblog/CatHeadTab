package middleware

import (
	"net/http"
	"strings"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Auth returns a Gin middleware that validates JWT tokens from the
// Authorization header and injects user_id into the context.
func Auth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing authorization header",
			})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid authorization format, expected: Bearer <token>",
			})
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid or expired token",
			})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid token claims",
			})
			return
		}

		userID, ok := claims["user_id"].(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "user_id not found in token",
			})
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

// RequireVerified returns a Gin middleware that checks whether the
// authenticated user has verified their email address. It must be used
// after the Auth middleware so that "user_id" is available in the context.
func RequireVerified(userRepo repository.UserRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.GetString("user_id")
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid user id",
			})
			return
		}

		user, err := userRepo.GetByID(userID)
		if err != nil || user == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "user not found",
			})
			return
		}

		if !user.EmailVerified {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":              "Email verification required. Please verify your email to use this feature.",
				"email_not_verified": true,
			})
			return
		}

		// Store user in context for downstream handlers to avoid redundant DB queries
		c.Set("user", user)
		c.Next()
	}
}

// RequireRole returns a Gin middleware that checks whether the authenticated
// user has one of the specified roles. It must be used after the Auth
// middleware so that "user_id" is available in the context.
//
// Usage:
//
//	router.Use(middleware.RequireRole(userRepo, model.RoleAdmin))
func RequireRole(userRepo repository.UserRepository, roles ...model.UserRole) gin.HandlerFunc {
	roleSet := make(map[model.UserRole]bool, len(roles))
	for _, r := range roles {
		roleSet[r] = true
	}

	return func(c *gin.Context) {
		// Try to reuse user from context (set by RequireVerified or another middleware)
		var user *model.User
		if u, exists := c.Get("user"); exists {
			user, _ = u.(*model.User)
		}

		if user == nil {
			userIDStr := c.GetString("user_id")
			userID, err := uuid.Parse(userIDStr)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "invalid user id",
				})
				return
			}

			var dbErr error
			user, dbErr = userRepo.GetByID(userID)
			if dbErr != nil || user == nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "user not found",
				})
				return
			}
		}

		if !roleSet[user.Role] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":         "insufficient permissions",
				"required_role": roles[0],
			})
			return
		}

		c.Set("user", user)
		c.Next()
	}
}
