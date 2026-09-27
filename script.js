const loginBadge = document.getElementById('loginBadge');
const amountInput = document.getElementById('amountInput');
const messageInput = document.getElementById('messageInput');
const charCount = document.getElementById('charCount');
const formNote = document.getElementById('formNote');
const feedList = document.getElementById('feedList');
const amountPresets = document.getElementById('amountPresets');

let currentUser = null;

function formatNumber(n) {
  return Number(n).toLocaleString('id-ID');
}

async function loadMe() {
  const res = await fetch('/api/me');
  const data = await res.json();
  currentUser = data.user;

  document.getElementById('creatorName').textContent = data.creator.name;
  document.getElementById('creatorTagline').textContent = data.creator.tagline;

  if (data.loggedIn) {
    loginBadge.innerHTML = `
      <button class="btn-roblox logged-in" id="loginBtn">
        ${data.user.username}
      </button>
    `;
  } else {
    loginBadge.innerHTML = `
      <button class="btn-roblox" id="loginBtn">Login dengan Roblox</button>
    `;
    document.getElementById('loginBtn').addEventListener('click', () => {
      window.location.href = '/auth/roblox/login';
    });
  }
}

async function loadDonations() {
  const res = await fetch('/api/donations');
  const donations = await res.json();

  if (!donations.length) {
    feedList.innerHTML = '<li class="feed-empty">Belum ada donasi. Jadi yang pertama.</li>';
    return;
  }

  feedList.innerHTML = donations
    .slice(0, 20)
    .map(
      (d) => `
      <li class="feed-item">
        <div>
          <span class="who">${escapeHtml(d.name)}</span>
          ${d.message ? `<span class="msg">${escapeHtml(d.message)}</span>` : ''}
        </div>
        <span class="amt">${formatNumber(d.amount)}</span>
      </li>
    `
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

amountPresets.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  amountInput.value = btn.dataset.amount;
  [...amountPresets.querySelectorAll('.chip')].forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
});

messageInput.addEventListener('input', () => {
  charCount.textContent = messageInput.value.length;
});

document.getElementById('donateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  formNote.textContent = '';
  formNote.className = 'form-note';

  const amount = amountInput.value;
  const message = messageInput.value;

  try {
    const res = await fetch('/api/donate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, message }),
    });
    const data = await res.json();

    if (!res.ok) {
      formNote.textContent = data.error || 'Gagal mengirim donasi.';
      formNote.classList.add('error');
      return;
    }

    formNote.textContent = 'Donasi terkirim! Makasih ya 🙌';
    formNote.classList.add('ok');
    amountInput.value = '';
    messageInput.value = '';
    charCount.textContent = '0';
    [...amountPresets.querySelectorAll('.chip')].forEach((c) => c.classList.remove('active'));
    loadDonations();
  } catch (err) {
    formNote.textContent = 'Terjadi kesalahan jaringan.';
    formNote.classList.add('error');
  }
});

// Tampilkan pesan hasil login dari query string (?login=sukses/gagal/dst)
const params = new URLSearchParams(window.location.search);
if (params.get('login')) {
  const status = params.get('login');
  window.history.replaceState({}, '', '/');
  if (status !== 'sukses') {
    console.warn('Login Roblox gagal:', status);
  }
}

loadMe();
loadDonations();
