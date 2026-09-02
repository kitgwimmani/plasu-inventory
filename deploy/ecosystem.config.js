// pm2 process definition for the PLASU SMIS API.
// Used by deploy/deploy.sh:  pm2 startOrReload deploy/ecosystem.config.js
//
// The app reads server/.env itself (via dotenv), so cwd must be the server dir.
const path = require("path");

module.exports = {
  apps: [
    {
      name: "plasu-smis",
      cwd: path.join(__dirname, "..", "server"),
      script: "server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
