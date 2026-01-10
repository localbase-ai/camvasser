#!/bin/bash
# Prisma safety wrapper - prevents accidental production database operations

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check if DATABASE_URL contains production indicators
check_production() {
    if [[ "$DATABASE_URL" == *"supabase"* ]] || \
       [[ "$DATABASE_URL" == *"aws"* ]] || \
       [[ "$DATABASE_URL" == *"prod"* ]] || \
       [[ "$DATABASE_URL" == *"pooler"* ]]; then
        return 0  # Is production
    fi
    return 1  # Is not production
}

# Dangerous commands that should never run against production
DANGEROUS_COMMANDS=("migrate reset" "db push --force-reset" "migrate dev")

is_dangerous() {
    local cmd="$*"
    for dangerous in "${DANGEROUS_COMMANDS[@]}"; do
        if [[ "$cmd" == *"$dangerous"* ]]; then
            return 0
        fi
    done
    return 1
}

# Main
if is_dangerous "$@"; then
    echo ""
    if check_production; then
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  BLOCKED: PRODUCTION DATABASE DETECTED!${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo -e "  DATABASE_URL points to what appears to be a production database."
        echo -e "  Running '${YELLOW}prisma $*${NC}' would ${RED}DESTROY ALL DATA${NC}."
        echo ""
        echo -e "  If you need to run this against production, you're probably"
        echo -e "  doing something wrong. Ask yourself why."
        echo ""
        echo -e "  To run against ${GREEN}local dev${NC}, make sure .env has:"
        echo -e "  DATABASE_URL=\"postgresql://ryanriggin@localhost:5432/camvasser_dev\""
        echo ""
        exit 1
    else
        echo -e "${YELLOW}Warning: Running destructive Prisma command on LOCAL database${NC}"
        echo -e "DATABASE_URL: $DATABASE_URL"
        echo ""
        read -p "Are you sure? (yes/no): " confirm
        if [[ "$confirm" != "yes" ]]; then
            echo "Aborted."
            exit 1
        fi
    fi
fi

# Run the actual prisma command
npx prisma "$@"
