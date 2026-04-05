/**
 * H.A.C. System - To Be Hero X WhatsApp Bot (Stable Minimal Version)
 */

const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");

const DATA_FILE = './data/heroes.json';
let heroes = {};
let activeBattles = {};

if (fs.existsSync(DATA_FILE)) {
  heroes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

const RANK_THRESHOLDS = [
  { min: 0, rank: 'Civilian (Abilities Locked)' },
  { min: 10, rank: 'Aspiring Hero (Weak Ability)' },
  { min: 50, rank: 'Trusted Ally' },
  { min: 200, rank: 'Rising Hero' },
  { min: 500, rank: 'Elite Hero' },
  { min: 1000, rank: 'Top Contender' },
  { min: 5000, rank: 'HERO X' }
];

function getRank(trust) {
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (trust >= RANK_THRESHOLDS[i].min) return RANK_THRESHOLDS[i].rank;
  }
  return RANK_THRESHOLDS[0].rank;
}

function saveHeroes() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(heroes, null, 2));
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  sock.ev.on('creds.update', saveCreds);

  // H.A.C. System Commands
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    const msg = chatUpdate.messages[0];
    if (!msg.message) return;

    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const groupJid = msg.key.remoteJid;
    if (!groupJid || !groupJid.endsWith('@g.us')) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    const isHAC = text.startsWith('!');
    const isRPAction = text.startsWith('/') && text.endsWith('/');

    if (!heroes[sender]) {
      heroes[sender] = { trust: 0, fear: 0, route: 'Civilian', ability: 'None', unlocked: false, quirk: '', missions: 0 };
    }

    if (isHAC) {
      const args = text.slice(1).trim().split(/\s+/);
      const cmd = args[0].toLowerCase();
      let reply = '';

      if (cmd === 'help') {
        reply = `🔵 *H.A.C. SYSTEM ONLINE*\n\nCommands:\n!register\n!profile @user\n!trust @user +50\n!chooseability @user "power with limiters"\n!battle @user1 @user2\n!raid\n!top10\n!challenge @user`;
      } else if (cmd === 'register') {
        heroes[sender].route = 'Aspiring Hero';
        reply = `🟢 *New Hero Registered*\nTrust: 0\nUse !chooseability "your power with limiters"`;
      } else if (cmd === 'profile' && args[1]) {
        const target = args[1].replace('@','') + '@s.whatsapp.net';
        const h = heroes[target] || { trust: 0, fear: 0, ability: 'None' };
        reply = `🔵 *Wrist Display*\nHero: ${args[1]}\nTrust: ${h.trust} | Rank: ${getRank(h.trust)}`;
      } else if (cmd === 'trust' && args[1]) {
        const target = args[1].replace('@','') + '@s.whatsapp.net';
        const amount = parseInt(args[2]) || 20;
        if (!heroes[target]) heroes[target] = { trust: 0, fear: 0, route: 'Civilian', ability: 'None', unlocked: false, quirk: '' };
        heroes[target].trust += amount;
        reply = `🟢 +${amount} Trust to ${args[1]}. Current: ${heroes[target].trust}`;
        saveHeroes();
      } else if (cmd === 'battle' && args[1]) {
        activeBattles[groupJid] = { players: [sender, args[1].replace('@','') + '@s.whatsapp.net'] };
        reply = `🌌 *Battle Started*\nUse /your action here/ only`;
      } else if (cmd === 'raid') {
        reply = `🌌 *System Raid Alert*\nThreat detected! Respond with /your action/`;
      }

      if (reply) {
        await sock.sendMessage(groupJid, { text: reply });
      }
    } 
    else if (isRPAction && activeBattles[groupJid]) {
      const battle = activeBattles[groupJid];
      if (battle.players.includes(sender)) {
        const action = text.slice(1, -1).trim();
        await sock.sendMessage(groupJid, { text: `🌌 *System:* ${sender.split('@')[0]} ${action}\n\nNext move?` });
      }
    }

    saveHeroes();
  });

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') {
      console.log('✅ H.A.C. System is Online!');
    }
  });

  return sock;
}

startBot().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
