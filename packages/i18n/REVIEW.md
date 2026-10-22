# Arabic translations awaiting human review

`CLAUDE.md`: every UI key has English and Arabic; Arabic written by the build loop (Claude) is a
**machine draft** and is listed here until a native speaker has checked it. When a section is
reviewed, move it to "Reviewed" with the reviewer's name and the date.

## Awaiting review

| Namespace                                                                               | Added by            | What to check                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stages.*`                                                                              | S-05                | The 12 case stages and 3 exit stages. These appear to patients, so the wording matters most. Check "التأهيل" (qualification), "الخروج والعودة" (discharge and return), and the exit stages "مفقودة" / "معلّقة" / "ملغاة".                                                                            |
| `nav.*`, `navSections.*`, `pages.*`                                                     | S-06                | The 79 portal screen names and one-line descriptions (patient, coordinator, hospital, agent, admin portals). Terms to confirm: "مسار الحالات" (case pipeline), "منشئ عروض الأسعار" (quote builder), "رسوم إحالة المستشفيات" (hospital referral fees), "مستوى الخدمة" (SLA), "ضريبة الاستقطاع" (TDS). |
| `site.*`                                                                                | S-06                | The public website's menus, footer, legal page names and the "coming soon" text. Legal page titles (privacy, terms, refund, medical disclaimer, grievance officer) should be checked by someone who knows the usual Arabic legal wording.                                                            |
| `shell.*`, `roles.*`, `portals.*`, `priority.*`, `placeholder.*`, `login.*`, `errors.*` | S-06                | Portal chrome, the eleven role names, the "planned for" labels, the stub login and the error and 404 pages. `errors.*` is shown to everyone, so read it first.                                                                                                                                       |
| Seed master data (`packages/db/prisma/seed.ts`)                                         | F-01, F-02                | Arabic names of 15 Indian cities, 25 specialities, 60 treatments, 12 document types and 8 lost reasons (the 245 country names come from CLDR). Treatment and speciality names will be shown to patients, so check medical wording (for example "رأب الأوعية", "جراحة تجاوز الشريان التاجي", "زراعة نخاع العظم").                 |
| `masters.*`                                                                             | F-02                | The admin master data screens: table names and descriptions, form labels, hints, confirmations, toasts. `masters.resources.*.singular` is used inside "Add {thing}" and "Edit {thing}", so check the grammar of each. |
| `gallery.*`                                                                             | S-05, S-06          | The component gallery (`/ui-gallery`): a development page, not patient-facing. Lowest risk.                                                                                                                                                                                                          |
| `common.appName`, `portal.title`                                                        | S-01, fixed in S-05 | The brand name is written "ميد ترافل". The S-01 draft mixed scripts ("ميدتravel"). Confirm how the brand should be written in Arabic.                                                                                                                                                                |

## Things worth a native speaker's eye

- **Plural forms.** Every counted message defines all six Arabic categories (zero, one, two, few,
  many, other). Check the wording of each, for example `gallery.table.total` and
  `gallery.uploader.uploadedCount`.
- **Numbers and dates use Latin digits** (decided in S-05, see `docs/questions.md`). Confirm this
  suits the target readers; switching is one line in `packages/ui/src/lib/format.ts`.
- **Medical vocabulary.** "Opinion" is translated "رأي" (hospital opinions = "آراء المستشفيات").
  Confirm that is the term patients expect.

## Reviewed

_None yet._
