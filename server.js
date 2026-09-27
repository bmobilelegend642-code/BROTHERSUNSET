require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// DATA_DIR bisa diarahkan ke folder Persistent Disk di Render (misal /var/data)
// supaya donasi & data player yang login nggak hilang tiap redeploy.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DONATIONS_FILE = path.join(DATA_DIR, 'donations.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const {
  ROBLOX_CLIENT_ID,
  ROBLOX_CLIENT_SECRET,
  ROBLOX_REDIRECT_URI,
  SESSION_SECRET,
  CREATOR_NAME,
  CREATOR_TAGLINE,
} = process.env;

if (!ROBLOX_CLIENT_ID || !ROBLOX_CLIENT_SECRET || !ROBLOX_REDIRECT_URI) {
  console.warn(
    '[WARNING] ROBLOX_CLIENT_ID / ROBLOX_CLIENT_SECRET / ROBLOX_REDIRECT_URI belum diisi di .env — Login dengan Roblox belum akan jalan.'
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  cookieSession({
    name: 'session',
    secret: SESSION_SECRET || 'dev-only-secret-ganti-ini',
    maxAge: 24 * 60 * 60 * 1000, // 24 jam
  })
);

// ---------- Helper: penyimpanan donasi (file JSON sederhana) ----------
function readDonations() {
  try {
    const raw = fs.readFileSync(DONATIONS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeDonations(list) {
  fs.writeFileSync(DONATIONS_FILE, JSON.stringify(list, null, 2));
}

function readUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeUsers(list) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2));
}

// Simpan/update data player yang login (dicari berdasarkan Roblox user id)
function upsertUser(profile) {
  const users = readUsers();
  const now = new Date().toISOString();
  const existing = users.find((u) => u.id === profile.id);

  if (existing) {
    existing.username = profile.username;
    existing.name = profile.name;
    existing.picture = profile.picture;
    existing.lastLoginAt = now;
    existing.loginCount = (existing.loginCount || 1) + 1;
  } else {
    users.push({
      id: profile.id,
      username: profile.username,
      name: profile.name,
      picture: profile.picture,
      firstLoginAt: now,
      lastLoginAt: now,
      loginCount: 1,
    });
  }

  writeUsers(users);
}

// ---------- Helper: PKCE ----------
function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
  );
  return { verifier, challenge };
}

// ---------- Auth: mulai login Roblox ----------
app.get('/auth/roblox/login', (req, res) => {
  const { verifier, challenge } = generatePKCE();
  const state = base64url(crypto.randomBytes(16));

  // simpan sementara di session (belum login penuh, cuma buat verifikasi callback)
  req.session.oauth_state = state;
  req.session.oauth_verifier = verifier;

  const params = new URLSearchParams({
    client_id: ROBLOX_CLIENT_ID,
    redirect_uri: ROBLOX_REDIRECT_URI,
    scope: 'openid profile',
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`);
});

// ---------- Auth: callback dari Roblox ----------
app.get('/auth/roblox/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/?login=gagal');
  }

  if (!code || !state || state !== req.session.oauth_state) {
    return res.redirect('/?login=invalid_state');
  }

  const verifier = req.session.oauth_verifier;
  req.session.oauth_state = null;
  req.session.oauth_verifier = null;

  try {
    // Tukar authorization code jadi access token
    const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ROBLOX_CLIENT_ID,
        client_secret: ROBLOX_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: ROBLOX_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Token exchange gagal:', tokenData);
      return res.redirect('/?login=token_error');
    }

    // Ambil info user dari Roblox
    const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Simpan info dasar user di session (jangan simpan token mentah ke client)
    const profile = {
      id: user.sub,
      username: user.preferred_username,
      name: user.name,
      picture: user.picture,
    };
    req.session.user = profile;

    // Catat/perbarui data player ini secara permanen (data/users.json)
    upsertUser(profile);

    res.redirect('/?login=sukses');
  } catch (e) {
    console.error(e);
    res.redirect('/?login=error');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// ---------- API: siapa yang sedang login ----------
app.get('/api/me', (req, res) => {
  res.json({
    loggedIn: !!(req.session && req.session.user),
    user: (req.session && req.session.user) || null,
    creator: {
      name: CREATOR_NAME || 'WESTINDUSTRY',
      tagline: CREATOR_TAGLINE || '',
    },
  });
});

// ---------- API: kirim donasi ----------
// Catatan: ini MENCATAT donasi, belum memproses pembayaran nyata.
// Sambungkan ke payment gateway (Midtrans/Xendit/QRIS) di titik ini kalau
// mau uang beneran berpindah sebelum donasi dicatat sebagai "paid".
app.post('/api/donate', (req, res) => {
  const { amount, message } = req.body;
  const loggedInUser = req.session && req.session.user;

  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0) {
    return res.status(400).json({ error: 'Jumlah donasi tidak valid' });
  }
  if (message && String(message).length > 255) {
    return res.status(400).json({ error: 'Pesan maksimal 255 karakter' });
  }

  const donation = {
    id: crypto.randomUUID(),
    name: loggedInUser ? loggedInUser.username : 'Seseorang',
    robloxId: loggedInUser ? loggedInUser.id : null,
    amount: amountNum,
    message: message ? String(message).slice(0, 255) : '',
    createdAt: new Date().toISOString(),
  };

  const donations = readDonations();
  donations.unshift(donation);
  writeDonations(donations.slice(0, 500)); // simpan maks 500 terbaru

  res.json({ ok: true, donation });
});

// ---------- API: daftar donasi terbaru ----------
// Endpoint ini yang bisa dipoll dari relay server (pola sama seperti relay
// Render yang sudah kamu pakai untuk Saweria dulu) supaya papan donasi
// in-game bisa update.
app.get('/api/donations', (req, res) => {
  const donations = readDonations();
  res.json(donations);
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});
