# Arabic translations awaiting human review

`CLAUDE.md`: every UI key has English and Arabic; Arabic written by the build loop (Claude) is a
**machine draft** and is listed here until a native speaker has checked it. When a section is
reviewed, move it to "Reviewed" with the reviewer's name and the date.

## Awaiting review

| Namespace | Added by | What to check |
| --- | --- | --- |
| `stages.*` | S-05 | The 12 case stages and 3 exit stages. These appear to patients, so the wording matters most. Check "التأهيل" (qualification), "الخروج والعودة" (discharge and return), and the exit stages "مفقودة" / "معلّقة" / "ملغاة". |
| `gallery.*` | S-05 | The component gallery (`/ui-gallery`): a development page, not patient-facing. Lowest risk. |
| `common.appName`, `portal.title` | S-01, fixed in S-05 | The brand name is written "ميد ترافل". The S-01 draft mixed scripts ("ميدتravel"). Confirm how the brand should be written in Arabic. |

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
