# Leads_Assignment - Country / State / IP Address

Source: every `*.spec.ts` under `tests/1.Project_CRM/2.Leads_Assignment` that calls
`selectCountry()` / `selectState()`. The IP Address column is a public IP whose
geolocation was verified live (country, and state where the test requires one).

Generated: 2026-06-30

| Country       | State         | IP Address       | Verified geolocation                     | # of TS |
|---------------|---------------|------------------|------------------------------------------|---------|
| Afghanistan   | (none)        | `180.94.80.1`    | Afghanistan / Nangarhar / Jalalabad      | 23      |
| Albania       | (none)        | `109.69.4.1`     | Albania / Tirana                         | 8       |
| Argentina     | (none)        | `200.45.191.35`  | Argentina / Chaco / Resistencia          | 1       |
| Australia     | (none)        | `139.130.4.4`    | Australia / NSW / Sydney                 | 2       |
| India         | Delhi         | `14.139.45.1`    | India / Delhi / New Delhi                | 4       |
| India         | Goa           | `14.139.114.14`  | India / Goa / Quepem (ipinfo.io)         | 4       |
| India         | Karnataka     | `14.139.128.1`   | India / Karnataka / Bengaluru            | 4       |
| India         | (blank / any) | `103.21.124.1`   | India / Maharashtra / Mumbai             | 4       |
| Indonesia     | (none)        | `202.134.0.155`  | Indonesia / Jakarta                      | 4       |
| Italy         | Piedmont      | `130.192.1.1`    | Italy / Piemonte / Torino                | 1       |
| Italy         | (none)        | `151.99.0.100`   | Italy / Lombardy / Milan                 | 4       |
| Malaysia      | (none)        | `202.188.0.133`  | Malaysia / Sarawak / Kuching             | 4       |
| Philippines   | (none)        | `122.2.0.1`      | Philippines / Metro Manila / Mandaluyong | 4       |
| Poland        | (none)        | `194.204.152.34` | Poland / Masovian / Warsaw               | 1       |
| Portugal      | (none)        | `213.13.146.142` | Portugal / Lisbon                        | 5       |
| Ukraine       | (none)        | `195.5.16.1`     | Ukraine / Lviv                           | 13      |
| United States | Connecticut   | `130.132.1.1`    | USA / Connecticut / New Haven            | 2       |

## Notes / caveats

1. **Geolocation is database-dependent.** Country (and state, where required) was verified
   against `ipwho.is`, except Goa which was verified via `ipinfo.io` - the two databases
   disagreed on Goa (`ipwho.is` folds it into Delhi). If the CRM/Odoo environment uses a
   specific provider (MaxMind, IP2Location, etc.), confirm each IP resolves the same way there.
2. **India "state blank" row.** An IP always resolves to *some* state, so `103.21.124.1`
   geolocates to Maharashtra/Mumbai. If those tests truly need an empty State field, IP-based
   input may not reproduce it - clear the State manually instead.
3. **Filename-vs-code mismatches in the source specs (FYI, not IP-related):**
   - `Marketing_BDEU` specs are named `...assign-france...` but the code selects **Afghanistan**.
   - `IBSA` `tc-ibsa-1-2-3-1-assign-argentina...` selects **Italy** (not Argentina) in code.

## Team / folder breakdown (where each country is used)

- **Afghanistan** - `Marketing_BDEU` (2.1 Lead_form-in x13, 2.2 Lead_Form-contain x10)
- **Albania** - `BDR_team` (1.1 Country_Group x4, 2.NOT_assign x4)
- **Argentina** - `IBSA_team` 1.2.3.2
- **Australia** - `BDEU_team` 1.2 Country_Group + 1.3 Public_domain
- **India** - `THD_team` (3.1.1.5 / 3.2.1.5 / 3.2.2.5 / 3.2.3.5: Delhi, Goa, Karnataka, state-blank)
- **Indonesia** - `THD_team` (3.1.1.2 / 3.2.1.2 / 3.2.2.2 / 3.2.3.2)
- **Italy** - `CMR_team` 7432-1-1-1-2-1 (Piedmont) + `IBSA_team` (1.1.1.1 / 1.2.1.1 / 1.2.2.1 / 1.2.3.1)
- **Malaysia** - `THD_team` (3.1.1.1 / 3.2.1.1 / 3.2.2.1 / 3.2.3.1)
- **Philippines** - `THD_team` (3.1.1.3 / 3.2.1.3 / 3.2.2.3 / 3.2.3.3)
- **Poland** - `CMR_team` 1.3.1.1
- **Portugal** - `BDEU_team` 2.NOT_assign (x5)
- **Ukraine** - `CMR_team` (x11) + `EAM_team` (x2)
- **United States** - `BDEU_team` 1.1 State_Group (x2)