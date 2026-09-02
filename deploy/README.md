# Deploying PLASU SMIS to the Contabo VPS

Target server: **`80.241.214.47`** (Ubuntu 22.04 / 24.04)

Architecture on the box:

```
Internet ──► nginx :80  ──► /opt/plasu-smis/client/build      (static React app)
                        └─► /api, /public  ──► Node API 127.0.0.1:5000 (systemd: plasu-smis)
                                                    └─► SQLite file  server/db/plasu_smis.sqlite
```

---

## 1. One-time server setup

SSH in as root and run the provisioning script. It installs Node 22, nginx,
creates the `plasu` service user, clones the repo to `/opt/plasu-smis`,
generates a `JWT_SECRET`, installs the systemd unit + nginx site, opens the
firewall, builds, and starts everything.

```bash
ssh root@80.241.214.47
git clone https://github.com/kitgwimmani/plasu-inventory-deployed.git /opt/plasu-smis
bash /opt/plasu-smis/deploy/setup.sh https://github.com/kitgwimmani/plasu-inventory-deployed.git main
```

For a **private** GitHub repo, first give the server read access — either a
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
or a Personal Access Token in the clone URL. This access must stay in place: every
deploy runs `git fetch` on the server as the `plasu` user (a read-only deploy key on
the `plasu` account is the tidy option). A public repo needs nothing extra.

When it finishes, open **http://80.241.214.47** and log in with
`superadmin@plasu.edu.ng` / `Passw0rd!` — then **change every default password**
(see the account list in the root `README.md`).

---

## 2. Auto-deploy on `git push` (GitHub Actions)

The workflow `.github/workflows/deploy.yml` builds the app on every push to
`main`, then SSHes into the VPS and runs `deploy/deploy.sh`.

### a. Create an SSH key for CI (on your laptop)

```bash
ssh-keygen -t ed25519 -f plasu_ci -N "" -C "github-actions"
```

### b. Authorise it on the server

```bash
ssh root@80.241.214.47
mkdir -p /home/plasu/.ssh && chmod 700 /home/plasu/.ssh
cat >> /home/plasu/.ssh/authorized_keys   # paste the contents of plasu_ci.pub
chown -R plasu:plasu /home/plasu/.ssh && chmod 600 /home/plasu/.ssh/authorized_keys
usermod --shell /bin/bash plasu            # allow the CI session to run the script
```

### c. Add repo secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `SSH_HOST` | `80.241.214.47` |
| `SSH_USER` | `plasu` |
| `SSH_PRIVATE_KEY` | full contents of the `plasu_ci` private key file |
| `SSH_PORT` | `22` (optional) |

Then just `git push origin main` — the Actions tab shows the deploy, and the
script fails loudly if the health check (`/api/health`) doesn't pass.

---

## 3. Manual deploy / rollback

```bash
ssh plasu@80.241.214.47 '/opt/plasu-smis/deploy/deploy.sh'          # deploy latest main
# rollback to a known-good commit:
ssh plasu@80.241.214.47 'cd /opt/plasu-smis && git reset --hard <sha> && deploy/deploy.sh'
```

---

## 4. Operations cheat-sheet

```bash
systemctl status plasu-smis           # is the API up?
journalctl -u plasu-smis -f           # live API logs
systemctl restart plasu-smis          # restart API
nginx -t && systemctl reload nginx    # apply nginx changes

# Database lives here (survives deploys, git-ignored):
/opt/plasu-smis/server/db/plasu_smis.sqlite
```

### Backups

The app exposes a one-click DB download for Super Admin / ICT Admin. For an
automated nightly copy:

```bash
sudo tee /etc/cron.d/plasu-smis-backup >/dev/null <<'EOF'
0 1 * * * plasu sqlite3 /opt/plasu-smis/server/db/plasu_smis.sqlite ".backup '/home/plasu/backup-$(date +\%F).sqlite'" && find /home/plasu -name 'backup-*.sqlite' -mtime +14 -delete
EOF
```

(`apt install sqlite3` if the CLI isn't present.)

---

## 5. Adding a domain + HTTPS later

1. Point an A record at `80.241.214.47`.
2. Edit `server_name` in `deploy/nginx/plasu-smis.conf` (and re-run a deploy) or
   directly in `/etc/nginx/sites-available/plasu-smis`.
3. `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d your-domain`
4. Set `CLIENT_ORIGIN=https://your-domain` in `/opt/plasu-smis/server/.env` and
   `systemctl restart plasu-smis`.
