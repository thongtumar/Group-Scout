> Hướng dẫn tiếng Việt: [Đưa source lên GitHub và chạy ứng dụng](HUONG-DAN-GITHUB.md).

# GroupScout

Vietnamese browser-local workspace for recruiting 500 eligible survey participants through Facebook communities. Configured for research on green consumption in real estate: people aged 18–65 intending to buy housing in Hà Nội and TP.HCM.

## Run and verify

Serve `dist/` using any static HTTP server. There is no build step or runtime package dependency.

```sh
python -m http.server 4173 --directory dist
npm test
```

`tests/browser_qa.py` checks discovery, CRUD, local persistence, invitations, JSON/CSV and mobile layout. `tests/browser_fieldwork.py` checks legacy migration, workflow, manual counts, sample distribution, source templates, pause, recovery and multi-tab protection. `tests/browser_usability.py` covers onboarding, reduced forms, separate searches, draft retention/conflicts, clipboard failure, mobile cards and cross-timezone dates. The browser scripts use Playwright with `/usr/bin/chromium` and a temporary local server. Their fixtures stay in isolated browser contexts.

## Everyday use and drafts

The empty collection desk starts with three guided actions rather than zero-value dashboards. A group needs only a name and direct Facebook group URL; city and activity remain unknown until entered. Optional observations collapse under More information. Direct mobile/mbasic group links normalize to the canonical address; opaque share tokens explain how to obtain the actual group address.

Facebook/Google discovery and filtering the local directory have separate controls. Each source has a direct Update samples action. Its profile has Progress, Sample counts and Source-link tabs; event dates appear only for the selected stage. Mobile source rows become cards and the save controls stay visible.

Unsaved group/profile forms and per-source invitation/admin drafts remain in tab-local sessionStorage, with memory fallback. These drafts are separate from confirmed localStorage records and are not included in JSON backups. Closing a form retains its draft; explicit Discard draft clears it. When another tab/import changes a confirmed record, only independently edited draft fields can merge; conflicting older drafts remain available for comparison and cannot silently overwrite newer counts. Copying source codes has a selectable-input fallback. User-facing days and backup timestamps use Asia/Bangkok.

## Fieldwork workflow

- A collection desk shows manual tasks and the recruitment stages: new, contacted, approved, pending post, posted, paused, rejected.
- User schedules take precedence. Verification older than 30 days needs review. Contact/pending statuses prompt a manual check after 3 days. Active posted sources prompt checks for new or unreviewed responses every 3 days since last review. Paused/rejected groups receive no outreach reminders. There are no background notifications or automatic messages.
- Total received, reviewed valid and rejected responses reconcile before save. Remaining known receipts are unreviewed. Only valid counts plus valid responses from other sources count toward 500.
- Legacy `responses` remain valid counts, with unknown receipt totals. Missing denominators and unrecorded effort produce unknown rates, never inferred zero cost or conversion.
- Each group has a stable, unique source code and optional respondent Google Form prefilled link created and checked by the researcher. Separate group-specific invitation and admin permission drafts use that link. The app does not fabricate form entry IDs or track respondents through UTM parameters.
- Manual city and age distributions describe the same valid responses without adding to progress. Default 250/250 city targets are editable operating markers, not representative quotas. Reducing source totals preserves historical classifications and flags discrepancies.
- Pausing a source preserves its responses. Permanent deletion/import keeps a local pre-change recovery snapshot, including raw bytes if a malformed local record is replaced. JSON/CSV export and backup timestamps help move between devices.
- A revision guard and storage-event notice prevent a stale tab from overwriting newer saved data. No server sync is provided.

## Data and limits

The app creates Facebook/Google search links; it has no direct Facebook data access, scraping or automatic posting. Group observations, permissions, workflow events and response quality are entered by the researcher. Anonymous participation and survey permission remain separate.

The six discovery examples are explicitly fictional, have blank URLs and never contribute to collection tasks, valid counts or real-data exports. No respondent personal information is required.

State remains under the existing `groupscout-v1` localStorage key with a version 2 snapshot so existing data can migrate. Workflow/source fields also appear in CSV. The exported hosting example `.openai/hosting.example.json` declares only the static output directory; it contains no live Site identity.

The UI uses Be Vietnam Pro from Google Fonts with system-font fallback. This ZIP is a source-code export; repository visibility and any future hosting are configured separately.
