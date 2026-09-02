# Deploying PLASU SMIS to the Contabo VPS

Target server: **`80.241.214.47`** (Ubuntu)

Current live setup ("Option B" — manual, then wired for CI):

```
Internet ─► nginx :80 ─► /home/deploy/plasu/plasu-inventory-deployed/client/build   (static React app)
                      └► /api, /public ─► Node API 127.0.0.1:5000  (pm2: "plasu-smis")
                                              └► SQLite  server/db/plasu_smis.sqlite
```

- SSH / app user: **`deploy`**
- Repo path: **`/home/deploy/plasu/plasu-inventory-deployed`**
- Process manager: **pm2**, app name **`plasu-smis`** (defined in `deploy/ecosystem.config.js`)

> `deploy/setup.sh` + `deploy/plasu-smis.service` are an alternative from-scratch
> path (root, `/opt/plasu-smis`, systemd). Ignore them unless you rebuild the box.

---

## 1. Auto-deploy on `git push` (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push to `main`: it builds the app on
a runner as a sanity check, then SSHes into the VPS and runs `deploy/deploy.sh`
(git reset → `npm ci` → `npm run build` → `pm2 reload` → `/api/health` check).

### a. Authorise the CI key on the server (once)

A dedicated SSH keypair for CI has been generated. Add its **public** key to the
`deploy` user:

```bash
ssh deploy@80.241.214.47
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAA...github-actions-deploy' >> ~/.ssh/authorized_keys   # the public key
chmod 600 ~/.ssh/authorized_keys
```

Then confirm the pm2 process matches the ecosystem file and persists across reboots:

```bash
cd ~/plasu/plasu-inventory-deployed
pm2 delete plasu-smis 2>/dev/null || true      # drop any earlier ad-hoc process
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup    # run the command it prints (uses sudo) so pm2 restarts on reboot
```

### b. Add repo secrets

GitHub → the **`plasu-inventory-deployed`** repo → Settings → Secrets and
variables → Actions → *New repository secret*:

| Secret | Value |
|---|---|
| `SSH_HOST` | `80.241.214.47` |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | the full CI **private** key, including the BEGIN/END lines |
| `SSH_PORT` | *(optional)* `22` |

### c. Ship it

```bash
git push deployed main
```

Watch the run in the repo's **Actions** tab. The job fails loudly (and prints
`pm2 logs`) if the health check doesn't pass after reload.

---

## 2. Manual deploy / rollback

```bash
# deploy latest main
ssh deploy@80.241.214.47 '~/plasu/plasu-inventory-deployed/deploy/deploy.sh'

# roll back to a known-good commit
ssh deploy@80.241.214.47 'cd ~/plasu/plasu-inventory-deployed && git reset --hard <sha> && ./deploy/deploy.sh'
```

---

## 3. Operations cheat-sheet

```bash
pm2 status                       # is the API up?
pm2 logs plasu-smis              # live API logs
pm2 reload plasu-smis            # restart API (zero-downtime)
sudo nginx -t && sudo systemctl reload nginx   # after editing the nginx site

# DB file (survives deploys, git-ignored):
~/plasu/plasu-inventory-deployed/server/db/plasu_smis.sqlite
```

### Nightly DB backup

```bash
sudo apt install -y sqlite3
( crontab -l 2>/dev/null; echo '0 1 * * * sqlite3 $HOME/plasu/plasu-inventory-deployed/server/db/plasu_smis.sqlite ".backup $HOME/backup-$(date +\%F).sqlite" && find $HOME -maxdepth 1 -name "backup-*.sqlite" -mtime +14 -delete' ) | crontab -
```

The app also exposes a one-click DB download for Super Admin / ICT Admin.

---

## 4. Adding a domain + HTTPS later

1. Point an A record at `80.241.214.47`.
2. Set `server_name` to the domain in `/etc/nginx/sites-available/plasu-smis`.
3. `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d your-domain`
4. Set `CLIENT_ORIGIN=https://your-domain` in `server/.env`, then `pm2 reload plasu-smis`.
