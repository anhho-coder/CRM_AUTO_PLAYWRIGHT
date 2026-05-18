# Import Path Solution for Test File Organization

## Problem
When moving test files to different subfolder depths, relative import paths (`../../../`) break and cause module resolution errors. This prevents tests from running and requires manual updates to all import statements.

## Solution: TypeScript Path Mapping

### Configuration (`tsconfig.json`)
Added absolute path aliases that work regardless of folder depth:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@config/*": ["./config/*"],
      "@pages": ["./pages/index.ts"],
      "@pages/*": ["./pages/*"],
      "@helpers/*": ["./helpers/*"]
    }
  }
}
```

### Usage in Test Files
Replace relative imports:
```typescript
// ❌ OLD - Breaks when moving files
import { users, baseUrl } from '../../../config/users.config';
import { config } from '../../../config/test.config';
import { LoginPage, HomePage, LeadPage } from '../../../pages';
```

With absolute path aliases:
```typescript
// ✅ NEW - Works at any folder depth
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
```

## Benefits

1. **Location Independent**: Move test files to any subfolder depth without updating imports
2. **No Cache Issues**: Eliminates Playwright module cache problems from path changes
3. **Cleaner Code**: Shorter, more readable import statements
4. **Easier Refactoring**: Reorganize test structure without breaking imports
5. **Consistent Paths**: All tests use the same import pattern regardless of location

## Migration Checklist

When creating new test files:
- ✅ Use `@config/` for configuration imports
- ✅ Use `@pages` for page object imports
- ✅ Use `@helpers/` for helper function imports

When moving existing test files:
- ✅ No changes needed if using path aliases
- ✅ Run `npx playwright test --list` to verify no import errors

## Example Test Structure

```
tests/
├── Leads_Assignment/
│   └── BDEU_team/
│       ├── 1.1. State_Group/          (4 levels deep)
│       │   └── test.spec.ts           (uses @config/users.config)
│       ├── 1.2. Country_Group/        (4 levels deep)
│       │   └── test.spec.ts           (uses @config/users.config)
│       └── 1.3. Public_domain/        (4 levels deep)
│           └── test.spec.ts           (uses @config/users.config)
```

All test files use the same imports regardless of depth.

## Verification

After updating tsconfig.json and test files:

```bash
# Verify all tests are discovered
npx playwright test --list

# Run tests to confirm imports work
npx playwright test tests/Leads_Assignment/BDEU_team --project=chromium
```

## Applied To

- ✅ `tests/Leads_Assignment/BDEU_team/1.1. State_Group/tc-bdeu-1-1-1-1-sales-team-bdeu.spec.ts`
- ✅ `tests/Leads_Assignment/BDEU_team/1.1. State_Group/tc-bdeu-1-1-1-2-salesperson-assigned-to-thomas-semerich.spec.ts`
- ✅ `tests/Leads_Assignment/BDEU_team/1.2. Country_Group/tc-bdeu-1-1-2-1-salesperson-assigned-to-bilal-saab.spec.ts`
- ✅ `tests/Leads_Assignment/BDEU_team/1.3. Public_domain/tc-bdeu-1-1-3-1-salesperson-assigned-by-email-domain.spec.ts`

All tests now run successfully with absolute path imports.
