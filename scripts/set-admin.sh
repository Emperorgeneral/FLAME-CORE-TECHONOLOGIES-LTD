#!/bin/bash
# Set user to admin role on production VPS
# Usage: ./set-admin.sh <email>

if [ -z "$1" ]; then
  echo "Usage: ./set-admin.sh <email>"
  echo "Example: ./set-admin.sh user@example.com"
  exit 1
fi

EMAIL="$1"

echo "🔐 Connecting to PostgreSQL and setting $EMAIL as admin..."

# Connect to PostgreSQL and run update
PGPASSWORD=flame2024 psql -h 127.0.0.1 -p 5433 -U flame -d flamecore << EOF

-- Check if user exists
SELECT id, email, role FROM users WHERE email='$EMAIL';

-- Update user to admin
UPDATE users SET role='admin' WHERE email='$EMAIL';

-- Verify update
SELECT id, email, role FROM users WHERE email='$EMAIL';

EOF

echo "✅ Done! User $EMAIL is now admin."
echo ""
echo "Next steps:"
echo "1. Logout from https://hosting.flamecoretechltd.com/"
echo "2. Login again with $EMAIL"
echo "3. Click 'ops' button to access admin console"
echo "4. Click 'emails' tab to access email manager"
