# Development users

One user per role, created by `pnpm db:seed` when `SEED_DEV_USERS=true` (see `packages/db/.env.example`). The seed
refuses to create them when `NODE_ENV=production`. **These accounts share a published password and must never exist
in staging or production.**

Password for every user: `Dev@12345`.

| Role                        | Email                                   | Lands in    |
| --------------------------- | --------------------------------------- | ----------- |
| patient                     | `patient@dev.medtravel.test`            | `/patient`  |
| attendant                   | `attendant@dev.medtravel.test`          | `/patient`  |
| agent                       | `agent@dev.medtravel.test`              | `/agent`    |
| case_manager                | `case-manager@dev.medtravel.test`       | `/ops`      |
| ground_coordinator          | `ground-coordinator@dev.medtravel.test` | `/ops`      |
| interpreter                 | `interpreter@dev.medtravel.test`        | `/ops`      |
| medical_reviewer            | `medical-reviewer@dev.medtravel.test`   | `/ops`      |
| hospital_desk               | `hospital-desk@dev.medtravel.test`      | `/hospital` |
| doctor                      | `doctor@dev.medtravel.test`             | `/hospital` |
| finance                     | `finance@dev.medtravel.test`            | `/admin`    |
| super_admin                 | `super-admin@dev.medtravel.test`        | `/admin`    |
| super_admin, 2FA already on | `admin-2fa@dev.medtravel.test`          | `/admin`    |

## Two-factor authentication

Staff, hospital and admin roles must use a second factor. Signing in as one of them without it takes you to the
set-up page and nothing else works until you finish it.

- **Locally**, set `AUTH_DEV_SKIP_2FA=true` in `apps/api/.env` (it is in `apps/api/.env.example`) and run the API with
  `NODE_ENV=development`: users who have not enrolled sign in without the second factor. The API refuses this flag in
  any other environment.
- **`admin-2fa@dev.medtravel.test`** has 2FA switched on with the fixed secret `KRSXG5CTMVRXEZLUKN2XAZLSKRSXG5CT`.
  Add it to an authenticator app (or compute the code with `otplib`) to try the challenge step. The browser tests do.

## Email

With `EMAIL_TRANSPORT=capture` (the default outside production) the API keeps mail in memory instead of sending it. To see
the messages, set `EMAIL_TRANSPORT=smtp` and open Mailpit at http://localhost:8025 (started by `pnpm dev`).
