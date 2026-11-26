# Security

Knowledge Kingdom is a static website: plain files on GitHub Pages, with no server, database,
accounts or payments. Reading progress stays in each reader's own browser.

## Reporting a problem

Please report security problems **privately** through GitHub:
[Report a vulnerability](https://github.com/knowledgekingdom/knowledgekingdom.github.io/security/advisories/new).
Don't open a public issue. You'll get a reply as soon as possible, and credit if you'd like it.

Useful things to include: the page address, what you did, what happened, and the browser you used.

## What protects the site

- **Content Security Policy** on every page (`scripts/csp.mjs`, run by `npm run build`): only the
  site's own scripts run, each inline script is allowed by its exact SHA-256 hash, and nothing can
  be loaded from other sites except the GoatCounter address that counts visits. The deploy
  refuses to publish a page without the policy.
- **No outside code**: the GoatCounter script is served from the site itself (`public/vendor/`).
- **Untrusted input is checked**: imported progress files and web-address parameters are
  validated before use.
- **Build**: GitHub Actions are pinned to exact commits, with minimal permissions and no secrets.
  Dependabot proposes updates; npm security fixes are opened automatically.
- **Repository**: `main` cannot be force-pushed or deleted; secret scanning and push protection
  block committed passwords or keys; two-factor sign-in on the owner's account.

## Keeping it that way (for whoever maintains the site)

- Never commit passwords, tokens or keys (push protection will stop most of them).
- If you add a script from another site, add its address to `scripts/csp.mjs`, and prefer copying
  it into `public/vendor/` instead.
- Review Dependabot pull requests before merging them.
- Renew the `Expires` date in `public/.well-known/security.txt` once a year (next: November 2027).
