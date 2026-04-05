/**
 * H.A.C. System - To Be Hero X RP Bot (Full Vision - Stable)
 * Storyteller + Moderator + Game Master
 */

const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");

console.log("✅ Starting H.A.C. System...");

const DATA_FILE = './data/heroes.json';
let heroes = {};
let activeBattles = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    heroes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.log("Warning: Could not load heroes data, starting fresh");
    heroes = {};
  }
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
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(heroes, null, 2));
  } catch (e) {}
}

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    const sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    sock.ev.on('creds.update', saveCreds);

    console.log('✅ Socket created - H.A.C. System ready');

    sock.ev.on('messages.upsert', async (chatUpdate) => {
      try {
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
            reply = `🔵 *H.A.C. SYSTEM ONLINE*\n\n!register\n!profile @user\n!trust @user +50\n!chooseability @user "power with limiters and quirk"\n!battle @user1 @user2\n!raid\n!top10\n!challenge @user`;
          } else if (cmd === 'register') {
            heroes[sender].route = 'Aspiring Hero';
            reply = `🟢 *New Hero Registered*\nTrust: 0\nChoose your ability with !chooseability "description with limiters"`;
          } else if (cmd === 'profile' && args[1]) {
            const target = args[1].replace('@','') + '@s.whatsapp.net';
            const h = heroes[target] || { trust: 0, fear: 0, ability: 'None' };
            reply = `🔵 *Wrist Display*\nHero: ${args[1]}\nTrust: ${h.trust} | Fear: ${h.fear}\nRank: ${getRank(h.trust)}\nRoute: ${h.route}\nAbility: ${h.ability}`;
          } else if (cmd === 'trust' && args[1]) {
            const target = args[1].replace('@','') + '@s.whatsapp.net';
            const amount = parseInt(args[2]) || 20;
            if (!heroes[target]) heroes[target] = { trust: 0, fear: 0, route: 'Civilian', ability: 'None', unlocked: false, quirk: '' };
            heroes[target].trust += amount;
            if (heroes[target].trust < 0) heroes[target].fear = Math.abs(heroes[target].trust);
            reply = `🟢 +${amount} Trust to ${args[1]}\nCurrent Trust: ${heroes[target].trust} | Rank: ${getRank(heroes[target].trust)}`;
            saveHeroes();
          } else if (cmd === 'chooseability' && args[1]) {
            const abilityDesc = text.slice(text.indexOf('"') + 1, text.lastIndexOf('"')) || args.slice(1).join(' ');
            heroes[sender].ability = abilityDesc;
            heroes[sender].unlocked = false;
            reply = `🟢 Ability registered: "${abilityDesc}"\nLimiters active until Trust 10+. Public quirk will form based on actions.`;
          } else if (cmd === 'battle' && args[1]) {
            activeBattles[groupJid] = { players: [sender, args[1].replace('@','') + '@s.whatsapp.net'] };
            reply = `🌌 *H.A.C. Battle Sequence Initiated*\n${sender.split('@')[0]} vs ${args[1]}\nUse /your action here/ format only.\nThe System and public are watching...`;
          } else if (cmd === 'raid') {
            reply = `🌌 *System Raid Alert*\nA new threat has appeared! Respond with /your action/ before time expires.\nSuccess = Trust gain. Failure = Fear rise.`;
          }

          if (reply) {
            await sock.sendMessage(groupJid, { text: reply });
          }
        } 
        // Interactive Game Master Narration (your main request)
        else if (isRPAction && activeBattles[groupJid]) {
          const battle = activeBattles[groupJid];
          if (battle.players.includes(sender)) {
            const action = text.slice(1, -1).trim();
            const response = `🌌 *H.A.C. System Narration*\n\n${sender.split('@')[0]}: ${action}\n\nThe action echoes through the city... Public reaction mixed.\nImpact analyzed. Trust/Fear may shift.\n\nNext move? (/your action here/)`;
            await sock.sendMessage(groupJid, { text: response });
          }
        }

        saveHeroes();
      } catch (err) {
        console.error("Handler error:", err.message);
      }
    });

    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'open') {
        console.log('✅ H.A.C. System is Online and ready for RP!');
      }
    });

    return sock;
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

startBot().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
