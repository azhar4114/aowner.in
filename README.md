# AglaOwner Frontend

Static frontend for AglaOwner, designed to be hosted on GitHub Pages.

## Included

- `index.html`
- `browse.html`
- `listing.html`
- `manage.html`
- `privacy.html`
- `terms.html`
- `sell.html`
- `assets/`

## Runtime configuration

Edit `assets/config.js` before deployment:

- `apiBaseUrl`: Google Apps Script web app base URL ending in `/exec`
- `googleFormUrl`: seller Google Form URL
- `sellerFormResponseUrl`: Google Form `formResponse` URL
- `sellerFormEntries`: live `entry.*` field mapping
- `supportEmail`
- `grievanceEmail`
- `publicAppUrl`

The frontend calls Apps Script using query-param routing:

- `GET /exec?route=listings`
- `GET /exec?route=listing&id=...`
- `GET /exec?route=owner-view&id=...&token=...`
- `POST /exec` with `route=interest`
- `POST /exec` with `route=owner-action`

## GitHub Pages

This repo is intended to publish from the root of the `main` branch.

- `CNAME` is set to `aglaowner.in`
- `.nojekyll` is included

After GitHub Pages is enabled, the site can be served from:

- `https://azhar4114.github.io/aowner.in/`
- or `https://aglaowner.in/` once DNS points to GitHub Pages

## Local preview

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.
