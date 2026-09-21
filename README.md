# Jewelry With A Past

A small website for **Debbie Huls — Jewelry With A Past**, who buys and resells jewelry
and some retro glassware. It has:

- A public **gallery** of pieces for sale (photo, description, price, sold/available badge).
- An **owner admin panel** at `/admin` — a simple, login-protected form to add, edit, and
  delete pieces. No coding required.
- A **contact/inquiry form** powered by [Formspree](https://formspree.io) (no checkout).

Built with plain HTML/CSS/JS on the front end and a small Node/Express server. Data (the
catalog) is stored in SQLite and uploaded photos on disk, both under a single data
directory so they can live on a persistent volume.

---

## Tech overview

| Piece            | Choice                                             |
| ---------------- | -------------------------------------------------- |
| Server           | Node.js + Express                                  |
| Database         | SQLite (`better-sqlite3`)                           |
| Image uploads    | `multer`, stored on disk                            |
| Auth             | Single admin password + signed session cookie      |
| Front end        | Plain HTML/CSS/JS (no build step)                   |
| Contact form     | Formspree                                          |
| Hosting target   | Railway (with a persistent volume)                 |

Everything the app writes — the SQLite file `sqlite.db` and the `uploads/` folder — lives
under `DATA_DIR` (default `./data` locally, `/data` on Railway).

---

## Running locally

1. **Install dependencies** (Node 18+):

   ```bash
   npm install
   ```

2. **Create your environment file** from the example and fill it in:

   ```bash
   cp .env.example .env
   ```

   Set at least:
   - `ADMIN_PASSWORD` — the password to log into `/admin` (required; the server won't start
     without it).
   - `SESSION_SECRET` — a long random string (`openssl rand -hex 32`).
   - `FORMSPREE_FORM_ID` — see [Formspree setup](#formspree-setup) below.

3. **Start the server:**

   ```bash
   npm start
   ```

   Open http://localhost:3000 for the site and http://localhost:3000/admin to manage pieces.

---

## Formspree setup

The contact form posts to Formspree (via a small vanilla-JS AJAX `fetch`), so inquiries
land in Debbie's inbox without a backend email service.

**It's already wired up.** The site ships with Debbie's form
(`https://formspree.io/f/xbglodve`) as the built-in default, so the contact form works out
of the box with no configuration. The very first time a message is submitted, Formspree
emails the form owner once to confirm the address.

To point the form at a **different** Formspree form later:

1. Create a form at https://formspree.io (free tier is fine for low volume) with the
   recipient set to the desired inbox.
2. Copy the ID from the endpoint URL `https://formspree.io/f/XXXXXXXX` (the part after
   `/f/`).
3. Set `FORMSPREE_FORM_ID=XXXXXXXX` in your environment (locally in `.env`, on Railway as a
   service variable). This overrides the default.

---

## Deploying to Railway

1. Push this repo to GitHub and create a new project on Railway from the repo (Railway
   auto-detects Node and runs `node server.js`).
2. **Add a Volume** to the service and set its **mount path to `/data`**. This is what keeps
   the catalog and photos across deploys/restarts.
3. **Add environment variables** (Service → Variables):
   - `ADMIN_PASSWORD` — a strong password.
   - `SESSION_SECRET` — a long random string.
   - `FORMSPREE_FORM_ID` — your Formspree form ID.
   - `DATA_DIR` — `/data` (matches the volume mount path).
   - `NODE_ENV` — `production` (enables secure cookies).
   - `PORT` is provided by Railway automatically — don't set it yourself.
4. Deploy. Railway gives you a public URL; `/admin` on that URL is the owner panel.

> **Important:** Without a volume mounted at `/data` (and `DATA_DIR=/data`), Railway's
> filesystem is ephemeral and pieces/photos would be lost on the next deploy.

---

## Using the admin panel (for Debbie)

1. Go to **`/admin`** on the site and log in with the admin password.
2. **Add a piece:** fill in the title, an optional description and price, pick a photo, and
   choose Available or Sold. Click **Add piece**.
   - Price is free text, so you can write `$45`, `Make an offer`, or `Contact for price`.
3. **Edit a piece:** click **Edit** on it, change anything (or replace/remove the photo),
   and **Save changes**.
4. **Mark as sold:** edit the piece and set its status to **Sold** — it stays on the site
   with a "Sold" badge. (Or delete it to remove it entirely.)
5. **Delete a piece:** click **Delete** and confirm.

Changes appear on the public gallery immediately.

---

## Project structure

```
server.js            Express app: static files, public + admin API, auth, uploads
db.js                SQLite schema and query helpers
public/
  index.html         Public gallery + contact form
  styles.css         Branding and layout
  app.js             Loads the gallery, wires "Inquire" + Formspree submit
  admin.html         Login + admin panel
  admin.js           Admin login and add/edit/delete logic
  images/            Branding assets
data/                Created at runtime — sqlite.db + uploads/ (gitignored / on the volume)
.env.example         Documented environment variables
railway.json         Railway start command
```

---

## Environment variables

| Variable            | Required | Default | Purpose                                            |
| ------------------- | -------- | ------- | -------------------------------------------------- |
| `ADMIN_PASSWORD`    | Yes      | —       | Password for the `/admin` panel                    |
| `SESSION_SECRET`    | Prod     | —       | Signs the login session cookie                     |
| `FORMSPREE_FORM_ID` | No       | `xbglodve` | Formspree form ID; overrides the built-in default  |
| `DATA_DIR`          | No       | `data`  | Where SQLite + uploads are stored (`/data` on Railway) |
| `NODE_ENV`          | No       | —       | Set to `production` on Railway (secure cookies)    |
| `PORT`              | No       | `3000`  | Set automatically by Railway                       |
